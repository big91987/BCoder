import { BaseParser } from './BaseParser';
import { ParseResult, ParserConfig } from './interfaces';

/**
 * XML格式解析器
 * 支持 <thought></thought> / <answer></answer> / <action><name></name><input></input></action> 格式
 */
export class XMLFormatParser extends BaseParser {
    constructor(config: ParserConfig) {
        super(config);
    }

    getFormat(): string {
        return 'xml';
    }

    reset(): void {
        // XML格式解析器是无状态的，无需重置
        this.debugLog('Parser reset');
    }

    parse(partialResponse: string): ParseResult {
        const result: ParseResult = {};

        this.debugLog('Parsing partial response', { 
            length: partialResponse.length,
            preview: partialResponse.substring(0, 100) + '...'
        });

        // 解析 <thought>...</thought>
        const thoughtMatch = partialResponse.match(/<thought>(.*?)(<\/thought>|$)/s);
        if (thoughtMatch) {
            result.thought = this.cleanText(thoughtMatch[1]);
            // 检查思考是否完整（有结束标签）
            result.isThoughtComplete = thoughtMatch[2] === '</thought>';
            this.debugLog('Found thought', { 
                thought: result.thought,
                isComplete: result.isThoughtComplete 
            });
        }

        // 解析 <answer>...</answer>
        const answerMatch = partialResponse.match(/<answer>(.*?)(<\/answer>|$)/s);
        if (answerMatch) {
            result.finalAnswer = this.cleanText(answerMatch[1]);
            // 检查答案是否完整（有结束标签）
            result.isAnswerComplete = answerMatch[2] === '</answer>';
            this.debugLog('Found answer', { 
                answer: result.finalAnswer,
                isComplete: result.isAnswerComplete 
            });
        }

        // 解析 <action><name>...</name><input>...</input></action>
        const actionMatch = partialResponse.match(/<action>(.*?)(<\/action>|$)/s);
        if (actionMatch) {
            const actionContent = actionMatch[1];
            const isActionComplete = actionMatch[2] === '</action>';
            
            // 解析action name
            const nameMatch = actionContent.match(/<name>(.*?)(<\/name>|$)/s);
            if (nameMatch) {
                result.action = this.cleanText(nameMatch[1]);
                this.debugLog('Found action name', { action: result.action });
            }
            
            // 解析action input
            const inputMatch = actionContent.match(/<input>(.*?)(<\/input>|$)/s);
            if (inputMatch) {
                const rawInput = this.cleanText(inputMatch[1]);
                result.actionInput = this.safeJsonParse(rawInput);
                this.debugLog('Found action input', { 
                    raw: rawInput,
                    parsed: result.actionInput 
                });
            }
            
            // 检查工具调用是否完整
            result.isActionComplete = isActionComplete && !!(result.action && result.actionInput);
            this.debugLog('Action completeness check', { 
                isActionComplete: result.isActionComplete,
                hasAction: !!result.action,
                hasInput: !!result.actionInput,
                hasClosingTag: isActionComplete
            });
        }

        return result;
    }
}
