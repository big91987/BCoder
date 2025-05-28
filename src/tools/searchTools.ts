import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult, SearchResult } from './types';
import { SecurityManager } from '../security/securityManager';
import { logger } from '../utils/logger';

/**
 * 文件搜索工具
 */
export class SearchFilesTool implements Tool {
    name = 'search_files';
    description = 'Search for files by name pattern';
    parameters = [
        {
            name: 'pattern',
            type: 'string' as const,
            description: 'File name pattern to search for (supports wildcards)',
            required: true
        },
        {
            name: 'directory',
            type: 'string' as const,
            description: 'Directory to search in (defaults to workspace root)',
            required: false
        },
        {
            name: 'recursive',
            type: 'boolean' as const,
            description: 'Whether to search recursively',
            required: false,
            default: true
        },
        {
            name: 'include_hidden',
            type: 'boolean' as const,
            description: 'Whether to include hidden files',
            required: false,
            default: false
        }
    ];

    constructor(private securityManager: SecurityManager, private workspaceRoot: string) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const pattern = args.pattern as string;
        const directory = args.directory as string || this.workspaceRoot;
        const recursive = args.recursive as boolean ?? true;
        const includeHidden = args.include_hidden as boolean || false;

        try {
            // 安全验证
            const permission = await this.securityManager.validateDirectoryAccess(directory);
            if (!permission.granted) {
                return {
                    success: false,
                    error: `Permission denied: ${permission.reason}`
                };
            }

            const absolutePath = path.resolve(directory);
            const results = this.searchFiles(absolutePath, pattern, recursive, includeHidden);
            
            logger.info(`Found ${results.length} files matching pattern: ${pattern}`);
            
            return {
                success: true,
                data: {
                    pattern: pattern,
                    directory: directory,
                    results: results,
                    count: results.length
                },
                message: `Found ${results.length} files matching "${pattern}"`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to search files: ${pattern}`, error);
            
            return {
                success: false,
                error: `Failed to search files: ${errorMessage}`
            };
        }
    }

    private searchFiles(dirPath: string, pattern: string, recursive: boolean, includeHidden: boolean): string[] {
        const results: string[] = [];
        const regex = this.patternToRegex(pattern);
        
        try {
            const entries = fs.readdirSync(dirPath);
            
            for (const entry of entries) {
                // 跳过隐藏文件（如果不包含隐藏文件）
                if (!includeHidden && entry.startsWith('.')) {
                    continue;
                }

                const fullPath = path.join(dirPath, entry);
                
                try {
                    const stats = fs.statSync(fullPath);
                    
                    // 检查文件名是否匹配模式
                    if (stats.isFile() && regex.test(entry)) {
                        results.push(fullPath);
                    }
                    
                    // 递归搜索子目录
                    if (recursive && stats.isDirectory()) {
                        const subResults = this.searchFiles(fullPath, pattern, recursive, includeHidden);
                        results.push(...subResults);
                    }
                } catch (error) {
                    // 跳过无法访问的文件
                    logger.warn(`Cannot access file: ${fullPath}`, error);
                }
            }
        } catch (error) {
            logger.error(`Cannot read directory: ${dirPath}`, error);
        }
        
        return results;
    }

    private patternToRegex(pattern: string): RegExp {
        // 将通配符模式转换为正则表达式
        const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
            .replace(/\*/g, '.*') // * 匹配任意字符
            .replace(/\?/g, '.'); // ? 匹配单个字符
        
        return new RegExp(`^${escaped}$`, 'i'); // 不区分大小写
    }
}

/**
 * 文件内容搜索工具
 */
export class SearchInFilesTool implements Tool {
    name = 'search_in_files';
    description = 'Search for text content within files';
    parameters = [
        {
            name: 'query',
            type: 'string' as const,
            description: 'Text to search for',
            required: true
        },
        {
            name: 'directory',
            type: 'string' as const,
            description: 'Directory to search in (defaults to workspace root)',
            required: false
        },
        {
            name: 'file_pattern',
            type: 'string' as const,
            description: 'File name pattern to limit search (e.g., "*.ts")',
            required: false,
            default: '*'
        },
        {
            name: 'case_sensitive',
            type: 'boolean' as const,
            description: 'Whether the search should be case sensitive',
            required: false,
            default: false
        },
        {
            name: 'max_results',
            type: 'number' as const,
            description: 'Maximum number of results to return',
            required: false,
            default: 100
        }
    ];

    constructor(private securityManager: SecurityManager, private workspaceRoot: string) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const query = args.query as string;
        const directory = args.directory as string || this.workspaceRoot;
        const filePattern = args.file_pattern as string || '*';
        const caseSensitive = args.case_sensitive as boolean || false;
        const maxResults = args.max_results as number || 100;

        try {
            // 安全验证
            const permission = await this.securityManager.validateDirectoryAccess(directory);
            if (!permission.granted) {
                return {
                    success: false,
                    error: `Permission denied: ${permission.reason}`
                };
            }

            const absolutePath = path.resolve(directory);
            const results = await this.searchInFiles(
                absolutePath, 
                query, 
                filePattern, 
                caseSensitive, 
                maxResults
            );
            
            logger.info(`Found ${results.length} matches for: ${query}`);
            
            return {
                success: true,
                data: {
                    query: query,
                    directory: directory,
                    results: results,
                    count: results.length
                },
                message: `Found ${results.length} matches for "${query}"`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to search in files: ${query}`, error);
            
            return {
                success: false,
                error: `Failed to search in files: ${errorMessage}`
            };
        }
    }

    private async searchInFiles(
        dirPath: string, 
        query: string, 
        filePattern: string, 
        caseSensitive: boolean, 
        maxResults: number
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const fileRegex = this.patternToRegex(filePattern);
        const searchRegex = new RegExp(
            query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
            caseSensitive ? 'g' : 'gi'
        );

        await this.searchDirectory(dirPath, fileRegex, searchRegex, results, maxResults);
        
        return results;
    }

    private async searchDirectory(
        dirPath: string,
        fileRegex: RegExp,
        searchRegex: RegExp,
        results: SearchResult[],
        maxResults: number
    ): Promise<void> {
        if (results.length >= maxResults) {
            return;
        }

        try {
            const entries = fs.readdirSync(dirPath);
            
            for (const entry of entries) {
                if (results.length >= maxResults) {
                    break;
                }

                // 跳过隐藏文件和目录
                if (entry.startsWith('.')) {
                    continue;
                }

                const fullPath = path.join(dirPath, entry);
                
                try {
                    const stats = fs.statSync(fullPath);
                    
                    if (stats.isFile() && fileRegex.test(entry)) {
                        await this.searchInFile(fullPath, searchRegex, results, maxResults);
                    } else if (stats.isDirectory()) {
                        await this.searchDirectory(fullPath, fileRegex, searchRegex, results, maxResults);
                    }
                } catch (error) {
                    // 跳过无法访问的文件
                    logger.warn(`Cannot access file: ${fullPath}`, error);
                }
            }
        } catch (error) {
            logger.error(`Cannot read directory: ${dirPath}`, error);
        }
    }

    private async searchInFile(
        filePath: string,
        searchRegex: RegExp,
        results: SearchResult[],
        maxResults: number
    ): Promise<void> {
        if (results.length >= maxResults) {
            return;
        }

        try {
            // 检查文件大小，跳过过大的文件
            const stats = fs.statSync(filePath);
            if (stats.size > 1024 * 1024) { // 1MB
                return;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                const line = lines[i];
                let match;
                
                // 重置正则表达式的 lastIndex
                searchRegex.lastIndex = 0;
                
                while ((match = searchRegex.exec(line)) !== null && results.length < maxResults) {
                    const contextStart = Math.max(0, i - 2);
                    const contextEnd = Math.min(lines.length - 1, i + 2);
                    const context = lines.slice(contextStart, contextEnd + 1).join('\n');
                    
                    results.push({
                        path: filePath,
                        line: i + 1,
                        column: match.index + 1,
                        content: line,
                        context: context
                    });
                    
                    // 防止无限循环
                    if (searchRegex.global && match[0].length === 0) {
                        break;
                    }
                }
            }
        } catch (error) {
            // 跳过无法读取的文件（可能是二进制文件）
            logger.warn(`Cannot read file: ${filePath}`, error);
        }
    }

    private patternToRegex(pattern: string): RegExp {
        // 将通配符模式转换为正则表达式
        const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
            .replace(/\*/g, '.*') // * 匹配任意字符
            .replace(/\?/g, '.'); // ? 匹配单个字符
        
        return new RegExp(`^${escaped}$`, 'i'); // 不区分大小写
    }
}
