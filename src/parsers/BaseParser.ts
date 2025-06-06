import { StreamingParser, ParseResult, ParserConfig } from './interfaces';
import { logger } from '../utils/logger';

/**
 * 基础解析器抽象类
 */
export abstract class BaseParser implements StreamingParser {
    protected config: ParserConfig;
    protected debug: boolean;

    constructor(config: ParserConfig) {
        this.config = config;
        this.debug = config.debug || false;
    }

    /**
     * 解析部分响应内容（抽象方法，子类必须实现）
     */
    abstract parse(partialResponse: string): ParseResult;

    /**
     * 获取解析器格式名称（抽象方法，子类必须实现）
     */
    abstract getFormat(): string;

    /**
     * 重置解析器状态（抽象方法，子类必须实现）
     */
    abstract reset(): void;

    /**
     * 检查解析结果是否完整
     */
    isComplete(result: ParseResult): boolean {
        // 基础完整性检查：有最终答案或有完整的工具调用
        const hasCompleteAnswer = result.finalAnswer && result.isAnswerComplete;
        const hasCompleteAction = result.action && result.actionInput && result.isActionComplete;
        
        return !!(hasCompleteAnswer || hasCompleteAction);
    }

    /**
     * 调试日志输出
     */
    protected debugLog(message: string, data?: any): void {
        if (this.debug) {
            logger.debug(`🔍 [${this.getFormat()}Parser] ${message}`, data);
        }
    }

    /**
     * 安全的JSON解析
     */
    protected safeJsonParse(jsonString: string): any {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            this.debugLog('JSON解析失败', { jsonString, error });
            return null;
        }
    }

    /**
     * 清理文本内容（移除多余空白字符）
     */
    protected cleanText(text: string): string {
        return text.trim().replace(/\s+/g, ' ');
    }
}
