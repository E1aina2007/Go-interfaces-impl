package server

import (
	"bytes"
	"encoding/json"
)

const ProtocolVersion = 1
const AnalyzerVersion = "0.0.1"
const MinimumGoVersion = "go1.24"

type InitializeParams struct {
	ProtocolVersion int    `json:"protocolVersion"`
	GoVersion       string `json:"goVersion"`
	GoExecutable    string `json:"goExecutable"`
	ModuleRootPath  string `json:"moduleRootPath"`
	GoModPath       string `json:"goModPath"`
}

type InitializeResult struct {
	ProtocolVersion   int    `json:"protocolVersion"`
	AnalyzerVersion   string `json:"analyzerVersion"`
	GoVersion         string `json:"goVersion"`
	MinimumGoVersion  string `json:"minimumGoVersion"`
	MaximumGoVersion  string `json:"maximumGoVersion"`
	AnalysisAvailable bool   `json:"analysisAvailable"`
}

type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type DocumentPosition struct {
	Path     string   `json:"path"`
	Version  int      `json:"version"`
	Position Position `json:"position"`
}

type Overlay struct {
	Path    string `json:"path"`
	Version int    `json:"version"`
	Text    string `json:"text"`
}

type Module struct {
	GoModPath  string `json:"goModPath"`
	RootPath   string `json:"rootPath"`
	ModulePath string `json:"modulePath"`
}

type Build struct {
	Key        string   `json:"key"`
	GoVersion  string   `json:"goVersion"`
	GOOS       string   `json:"goos"`
	GOARCH     string   `json:"goarch"`
	CGOEnabled bool     `json:"cgoEnabled"`
	BuildFlags []string `json:"buildFlags"`
	GoWorkPath *string  `json:"goWorkPath"`
}

type Snapshot struct {
	ID         string `json:"id"`
	Generation int    `json:"generation"`
	Module     Module `json:"module"`
	Build      Build  `json:"build"`
}

type AnalysisInput struct {
	RequestID string           `json:"requestId"`
	Source    DocumentPosition `json:"source"`
	Direction string           `json:"direction"`
	Snapshot  Snapshot         `json:"snapshot"`
	Overlays  []Overlay        `json:"overlays"`
}

type Failure struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Outcome struct {
	Status string   `json:"status"`
	Error  *Failure `json:"error,omitempty"`
}

type AnalysisResponse struct {
	RequestID string  `json:"requestId"`
	Outcome   Outcome `json:"outcome"`
}

func failed(code, message string) Outcome {
	return Outcome{Status: "failed", Error: &Failure{Code: code, Message: message}}
}

// Reject unknown transport fields so incompatible clients cannot silently alter analysis inputs.
// 拒绝未知传输字段，避免不兼容的客户端静默改变分析输入
func decode(params *json.RawMessage, value any) error {
	if params == nil || string(*params) == "null" {
		return &invalidParams
	}
	decoder := json.NewDecoder(bytes.NewReader(*params))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return &invalidParams
	}
	return nil
}
