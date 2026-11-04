package server

import (
	"context"
	"go/version"
	"io"
	"log"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/sourcegraph/jsonrpc2"
)

var invalidParams = jsonrpc2.Error{Code: jsonrpc2.CodeInvalidParams, Message: "Invalid request parameters"}

type Server struct {
	initialized bool
	stopping    bool
	config      InitializeParams
	pending     map[jsonrpc2.ID]context.CancelFunc
	mu          sync.Mutex
	work        sync.WaitGroup
	slot        chan struct{}
	logger      *log.Logger
}

func Run(ctx context.Context, stream io.ReadWriteCloser, logger *log.Logger) {
	s := &Server{pending: make(map[jsonrpc2.ID]context.CancelFunc), slot: make(chan struct{}, 1), logger: logger}
	conn := jsonrpc2.NewConn(ctx, jsonrpc2.NewBufferedStream(stream, jsonrpc2.VSCodeObjectCodec{}), s, jsonrpc2.SetLogger(logger))
	<-conn.DisconnectNotify()
	s.cancelAll()
	s.work.Wait()
}

func (s *Server) Handle(ctx context.Context, conn *jsonrpc2.Conn, req *jsonrpc2.Request) {
	if req.Method == "$/cancelRequest" {
		var params struct {
			ID jsonrpc2.ID `json:"id"`
		}
		if req.Notif && decode(req.Params, &params) == nil {
			s.mu.Lock()
			if cancel := s.pending[params.ID]; cancel != nil {
				cancel()
			}
			s.mu.Unlock()
		}
		return
	}
	if req.Method == "invalidate" && req.Notif {
		s.cancelAll()
		return
	}
	if req.Notif {
		return
	}
	switch req.Method {
	case "initialize":
		s.initialize(ctx, conn, req)
	case "analyze":
		s.analyze(ctx, conn, req)
	case "shutdown":
		s.stopping = true
		s.cancelAll()
		go func() {
			s.work.Wait()
			s.reply(ctx, conn, req.ID, nil, nil)
			if err := conn.Close(); err != nil {
				s.logger.Printf("close: %v", err)
			}
		}()
	default:
		s.reply(ctx, conn, req.ID, nil, &jsonrpc2.Error{Code: jsonrpc2.CodeMethodNotFound, Message: "Unknown method"})
	}
}

func (s *Server) initialize(ctx context.Context, conn *jsonrpc2.Conn, req *jsonrpc2.Request) {
	var params InitializeParams
	if err := decode(req.Params, &params); err != nil {
		s.reply(ctx, conn, req.ID, nil, &invalidParams)
		return
	}
	if s.initialized || s.stopping || params.ProtocolVersion != ProtocolVersion {
		s.reply(ctx, conn, req.ID, nil, &jsonrpc2.Error{Code: -32001, Message: "Incompatible protocol version or lifecycle state"})
		return
	}
	if !filepath.IsAbs(params.ModuleRootPath) || params.GoModPath != filepath.Join(params.ModuleRootPath, "go.mod") {
		s.reply(ctx, conn, req.ID, nil, &invalidParams)
		return
	}
	if _, err := exec.LookPath(params.GoExecutable); err != nil {
		s.reply(ctx, conn, req.ID, nil, &jsonrpc2.Error{Code: -32002, Message: "Go executable not found"})
		return
	}
	maximum := version.Lang(runtime.Version())
	if !version.IsValid(params.GoVersion) || version.Compare(params.GoVersion, MinimumGoVersion) < 0 || version.Compare(version.Lang(params.GoVersion), maximum) > 0 {
		s.reply(ctx, conn, req.ID, nil, &jsonrpc2.Error{Code: -32003, Message: "Go version is outside the analyzer language range"})
		return
	}
	s.config = params
	s.initialized = true
	s.reply(ctx, conn, req.ID, InitializeResult{ProtocolVersion, AnalyzerVersion, runtime.Version(), MinimumGoVersion, maximum, false}, nil)
}

func (s *Server) analyze(ctx context.Context, conn *jsonrpc2.Conn, req *jsonrpc2.Request) {
	var input AnalysisInput
	if !s.initialized || s.stopping {
		s.reply(ctx, conn, req.ID, nil, &jsonrpc2.Error{Code: -32001, Message: "Analyzer is not initialized or is stopping"})
		return
	}
	if decode(req.Params, &input) != nil || !s.validInput(input) {
		s.reply(ctx, conn, req.ID, nil, &invalidParams)
		return
	}
	ctx, cancel := context.WithCancel(ctx)
	// Register cancellation before dispatch so a following notification cannot overtake the request.
	// 分派前注册取消函数，避免紧随其后的取消通知越过请求
	s.mu.Lock()
	s.pending[req.ID] = cancel
	s.mu.Unlock()
	s.work.Add(1)
	go func() {
		defer s.work.Done()
		defer cancel()
		defer func() {
			s.mu.Lock()
			delete(s.pending, req.ID)
			s.mu.Unlock()
		}()
		select {
		case s.slot <- struct{}{}:
			defer func() { <-s.slot }()
		case <-ctx.Done():
			s.reply(ctx, conn, req.ID, AnalysisResponse{input.RequestID, Outcome{Status: "cancelled"}}, nil)
			return
		}
		outcome := failed("analyzer-unavailable", "Semantic analysis has not been implemented yet")
		if ctx.Err() != nil {
			outcome = Outcome{Status: "cancelled"}
		}
		s.reply(ctx, conn, req.ID, AnalysisResponse{input.RequestID, outcome}, nil)
	}()
}

func (s *Server) validInput(input AnalysisInput) bool {
	if input.RequestID == "" || input.Snapshot.ID == "" || input.Snapshot.Build.Key == "" || input.Snapshot.Generation < 0 || input.Source.Version < 0 || input.Source.Position.Line < 0 || input.Source.Position.Character < 0 {
		return false
	}
	if input.Snapshot.Module.RootPath != s.config.ModuleRootPath || input.Snapshot.Module.GoModPath != s.config.GoModPath || input.Snapshot.Module.ModulePath == "" || input.Snapshot.Build.GoVersion != s.config.GoVersion || !filepath.IsAbs(input.Source.Path) {
		return false
	}
	if input.Direction != "auto" && input.Direction != "interfaces" && input.Direction != "structs" {
		return false
	}
	if input.Snapshot.Build.GOOS == "" || input.Snapshot.Build.GOARCH == "" {
		return false
	}
	if input.Snapshot.Build.GoWorkPath != nil && !filepath.IsAbs(*input.Snapshot.Build.GoWorkPath) {
		return false
	}
	found := false
	for _, overlay := range input.Overlays {
		if !filepath.IsAbs(overlay.Path) || overlay.Version < 0 {
			return false
		}
		if overlay.Path == input.Source.Path && overlay.Version == input.Source.Version {
			found = true
		}
	}
	return found
}

func (s *Server) cancelAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, cancel := range s.pending {
		cancel()
	}
}

func (s *Server) reply(ctx context.Context, conn *jsonrpc2.Conn, id jsonrpc2.ID, result any, rpcErr *jsonrpc2.Error) {
	// Replies must survive request cancellation; the connection still owns the transport lifetime.
	// 请求取消后仍需发送响应，传输资源的生命周期由连接管理
	ctx = context.WithoutCancel(ctx)
	var err error
	if rpcErr != nil {
		err = conn.ReplyWithError(ctx, id, rpcErr)
	} else {
		err = conn.Reply(ctx, id, result)
	}
	if err != nil {
		s.logger.Printf("reply: %v", err)
	}
}
