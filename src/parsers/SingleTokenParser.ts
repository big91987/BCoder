import { BaseParser } from './BaseParser';
import { ParseResult, ParserConfig } from './interfaces';

/**
 * 单token格式解析器
 * 支持 THOUGHT: / ANSWER: / ACTION: / ACTION_INPUT: 格式
 */
export class SingleTokenParser extends BaseParser {
    constructor(config: ParserConfig) {
        super(config);
    }

    getFormat(): string {
        return 'single-token';
    }

    reset(): void {
        // 单token格式解析器是无状态的，无需重置
        this.debugLog('Parser reset');
    }

    parse(partialResponse: string): ParseResult {
        const result: ParseResult = {};

        this.debugLog('Parsing partial response', { 
            length: partialResponse.length,
            preview: partialResponse.substring(0, 100) + '...'
        });

        // 解析 THOUGHT（支持单行和多行格式，包括换行符）
        const thoughtMatch = partialResponse.match(/THOUGHT:\s*(.+?)(?=\s*(?:ACTION|ANSWER)|$)/s);
        if (thoughtMatch) {
            result.thought = this.cleanText(thoughtMatch[1]);
            // 检查思考是否完整（后面有其他标签或到达末尾）
            result.isThoughtComplete = /THOUGHT:\s*.+?\s*(?:ACTION|ANSWER)/.test(partialResponse);
            this.debugLog('Found thought', { 
                thought: result.thought,
                isComplete: result.isThoughtComplete 
            });
        }

        // 解析 ACTION（必须完整）
        const actionMatch = partialResponse.match(/ACTION:\s*(.+?)(?=\s*(?:ACTION_INPUT|THOUGHT|ANSWER)|$)/s);
        if (actionMatch) {
            result.action = this.cleanText(actionMatch[1]);
            this.debugLog('Found action', { action: result.action });
        }

        // 解析 ACTION_INPUT（必须完整）
        const actionInputMatch = partialResponse.match(/ACTION_INPUT:\s*(.+?)(?=\s*(?:THOUGHT|ANSWER)|$)/s);
        if (actionInputMatch) {
            const rawActionInput = this.cleanText(actionInputMatch[1]);
            result.actionInput = this.safeJsonParse(rawActionInput);
            
            // 检查工具调用是否完整
            result.isActionComplete = !!(result.action && result.actionInput);
            
            this.debugLog('Found action input', { 
                raw: rawActionInput,
                parsed: result.actionInput,
                isComplete: result.isActionComplete 
            });
        }

        // 解析 ANSWER（支持单行和多行格式，包括换行符）
        const answerMatch = partialResponse.match(/ANSWER:\s*(.+?)$/s);
        if (answerMatch) {
            result.finalAnswer = this.cleanText(answerMatch[1]);
            // 检查答案是否完整（通常认为到达末尾就是完整的）
            result.isAnswerComplete = true;
            this.debugLog('Found answer', { 
                answer: result.finalAnswer,
                isComplete: result.isAnswerComplete 
            });
        }

        return result;
    }
}
