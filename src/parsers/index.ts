// 接口和类型
export * from './interfaces';

// 基础类
export { BaseParser } from './BaseParser';

// 具体解析器实现
export { TextFormatParser } from './TextFormatParser';
export { SingleTokenParser } from './SingleTokenParser';
export { XMLFormatParser } from './XMLFormatParser';

// 工厂类
export { ParserFactory } from './ParserFactory';

// 便捷函数
import { ParserFactory } from './ParserFactory';

export function createParser(format: 'text' | 'xml' | 'single-token', options?: Record<string, any>) {
    return ParserFactory.createParser({
        format,
        debug: false,
        options
    });
}

export function createDebugParser(format: 'text' | 'xml' | 'single-token', options?: Record<string, any>) {
    return ParserFactory.createParser({
        format,
        debug: true,
        options
    });
}
