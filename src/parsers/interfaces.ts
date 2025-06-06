/**
 * 流式解析结果
 */
export interface ParseResult {
    /** 思考内容 */
    thought?: string;
    /** 工具名称 */
    action?: string;
    /** 工具输入参数 */
    actionInput?: any;
    /** 最终答案 */
    finalAnswer?: string;
    /** 思考是否完成 */
    isThoughtComplete?: boolean;
    /** 答案是否完成 */
    isAnswerComplete?: boolean;
    /** 工具调用是否完成 */
    isActionComplete?: boolean;
}

/**
 * 流式解析器接口
 */
export interface StreamingParser {
    /**
     * 解析部分响应内容
     * @param partialResponse 部分响应内容
     * @returns 解析结果
     */
    parse(partialResponse: string): ParseResult;

    /**
     * 获取解析器格式名称
     * @returns 格式名称
     */
    getFormat(): string;

    /**
     * 检查解析结果是否完整
     * @param result 解析结果
     * @returns 是否完整
     */
    isComplete(result: ParseResult): boolean;

    /**
     * 重置解析器状态（用于新的解析会话）
     */
    reset(): void;
}

/**
 * 解析器配置
 */
export interface ParserConfig {
    /** 响应格式 */
    format: 'text' | 'xml' | 'single-token';
    /** 是否启用调试模式 */
    debug?: boolean;
    /** 自定义配置 */
    options?: Record<string, any>;
}
