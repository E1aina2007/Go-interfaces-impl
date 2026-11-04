# Go Interfaces Impl

用于查看 Go module 内接口与结构体实现关系的 VS Code 插件，视觉呈现与交互计划参考 GoLand。

## 项目目标

- 从 struct 查看当前 Go module 内它实现的所有接口
- 从接口查看当前 Go module 内实现它的所有 struct
- 支持过滤位于引入 `testing` 包的单元测试代码中的接口实现

## 开发约定

完整规范见 [AGENTS.md](AGENTS.md)。

- 使用 JavaScript 或 TypeScript，保持 Go 风格的简洁与可读性
- 优先复用成熟外部库，避免重复实现
- 重要或难懂的逻辑使用英文、中文各一行的注释，中文注释不使用中文句号
- 除非收到明确指令，否则不编写任何单元测试

## 当前状态

本次初始化仅建立项目说明与开发规范，扩展框架和业务功能将在后续独立提交中加入。
