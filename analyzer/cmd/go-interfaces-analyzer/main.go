package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/E1aina2007/Go-interfaces-impl/analyzer/internal/server"
)

type stdio struct{}

func (stdio) Read(p []byte) (int, error)  { return os.Stdin.Read(p) }
func (stdio) Write(p []byte) (int, error) { return os.Stdout.Write(p) }
func (stdio) Close() error                { return errors.Join(os.Stdin.Close(), os.Stdout.Close()) }

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// Standard output is reserved for framed RPC messages; all diagnostics go to standard error.
	// 标准输出仅用于带消息边界的 RPC 数据，诊断信息统一写入标准错误
	server.Run(ctx, stdio{}, log.New(os.Stderr, "analyzer: ", log.LstdFlags))
}
