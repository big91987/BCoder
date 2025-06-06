import { StreamingParser, ParserConfig } from './interfaces';
import { TextFormatParser } from './TextFormatParser';
import { XMLFormatParser } from './XMLFormatParser';
import { SingleTokenParser } from './SingleTokenParser';
import { logger } from '../utils/logger';

/**
 * 解析器工厂类
 */
export class ParserFactory {
    /**
     * 创建解析器实例
     * @param config 解析器配置
     * @returns 解析器实例
     */
    static createParser(config: ParserConfig): StreamingParser {
        logger.info(`🏭 [ParserFactory] Creating parser for format: ${config.format}`);
        
        switch (config.format) {
            case 'xml':
                return new XMLFormatParser(config);
            
            case 'single-token':
                return new SingleTokenParser(config);
            
            case 'text':
            default:
                return new TextFormatParser(config);
        }
    }

    /**
     * 获取所有支持的格式
     * @returns 支持的格式列表
     */
    static getSupportedFormats(): string[] {
        return ['text', 'xml', 'single-token'];
    }

    /**
     * 检查格式是否支持
     * @param format 格式名称
     * @returns 是否支持
     */
    static isFormatSupported(format: string): boolean {
        return this.getSupportedFormats().includes(format);
    }
}
