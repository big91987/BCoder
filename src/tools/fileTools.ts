import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult, FileInfo, EditChange } from './types';
import { SecurityManager } from '../security/securityManager';
import { logger } from '../utils/logger';

/**
 * 文件读取工具
 */
export class ReadFileTool implements Tool {
    name = 'read_file';
    description = 'Read the contents of a file';
    parameters = [
        {
            name: 'path',
            type: 'string' as const,
            description: 'Path to the file to read',
            required: true
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;

        try {
            // 安全验证
            const permission = await this.securityManager.validateFileRead(filePath);
            if (!permission.granted) {
                return {
                    success: false,
                    error: `Permission denied: ${permission.reason}`
                };
            }

            // 读取文件
            const absolutePath = path.resolve(filePath);
            const content = fs.readFileSync(absolutePath, 'utf-8');
            
            logger.info(`File read successfully: ${filePath}`);
            
            return {
                success: true,
                data: {
                    path: filePath,
                    content: content,
                    size: content.length
                },
                message: `Successfully read file: ${filePath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to read file: ${filePath}`, error);
            
            return {
                success: false,
                error: `Failed to read file: ${errorMessage}`
            };
        }
    }
}

/**
 * 文件写入工具
 */
export class WriteFileTool implements Tool {
    name = 'write_file';
    description = 'Write content to a file (creates new file or overwrites existing)';
    parameters = [
        {
            name: 'path',
            type: 'string' as const,
            description: 'Path to the file to write',
            required: true
        },
        {
            name: 'content',
            type: 'string' as const,
            description: 'Content to write to the file',
            required: true
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;
        const content = args.content as string;

        try {
            // 安全验证
            const permission = await this.securityManager.validateFileWrite(filePath);
            if (!permission.granted) {
                return {
                    success: false,
                    error: `Permission denied: ${permission.reason}`
                };
            }

            // 确保目录存在
            const absolutePath = path.resolve(filePath);
            const directory = path.dirname(absolutePath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }

            // 写入文件
            fs.writeFileSync(absolutePath, content, 'utf-8');
            
            logger.info(`File written successfully: ${filePath}`);
            
            return {
                success: true,
                data: {
                    path: filePath,
                    size: content.length
                },
                message: `Successfully wrote file: ${filePath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to write file: ${filePath}`, error);
            
            return {
                success: false,
                error: `Failed to write file: ${errorMessage}`
            };
        }
    }
}

/**
 * 文件编辑工具（字符串替换）
 */
export class EditFileTool implements Tool {
    name = 'edit_file';
    description = 'Edit a file by replacing specific text content';
    parameters = [
        {
            name: 'path',
            type: 'string' as const,
            description: 'Path to the file to edit',
            required: true
        },
        {
            name: 'old_text',
            type: 'string' as const,
            description: 'Text to find and replace',
            required: true
        },
        {
            name: 'new_text',
            type: 'string' as const,
            description: 'New text to replace with',
            required: true
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;
        const oldText = args.old_text as string;
        const newText = args.new_text as string;

        try {
            // 安全验证
            const readPermission = await this.securityManager.validateFileRead(filePath);
            if (!readPermission.granted) {
                return {
                    success: false,
                    error: `Read permission denied: ${readPermission.reason}`
                };
            }

            const writePermission = await this.securityManager.validateFileWrite(filePath);
            if (!writePermission.granted) {
                return {
                    success: false,
                    error: `Write permission denied: ${writePermission.reason}`
                };
            }

            // 读取文件
            const absolutePath = path.resolve(filePath);
            const originalContent = fs.readFileSync(absolutePath, 'utf-8');
            
            // 检查是否找到要替换的文本
            if (!originalContent.includes(oldText)) {
                return {
                    success: false,
                    error: `Text not found in file: "${oldText}"`
                };
            }

            // 执行替换
            const newContent = originalContent.replace(oldText, newText);
            
            // 写入文件
            fs.writeFileSync(absolutePath, newContent, 'utf-8');
            
            logger.info(`File edited successfully: ${filePath}`);
            
            return {
                success: true,
                data: {
                    path: filePath,
                    originalSize: originalContent.length,
                    newSize: newContent.length,
                    replacements: 1
                },
                message: `Successfully edited file: ${filePath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to edit file: ${filePath}`, error);
            
            return {
                success: false,
                error: `Failed to edit file: ${errorMessage}`
            };
        }
    }
}

/**
 * 获取文件信息工具
 */
export class GetFileInfoTool implements Tool {
    name = 'get_file_info';
    description = 'Get information about a file or directory';
    parameters = [
        {
            name: 'path',
            type: 'string' as const,
            description: 'Path to the file or directory',
            required: true
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;

        try {
            // 安全验证
            const permission = this.securityManager.validatePath(filePath);
            if (!permission.granted) {
                return {
                    success: false,
                    error: `Permission denied: ${permission.reason}`
                };
            }

            const absolutePath = path.resolve(filePath);
            
            if (!fs.existsSync(absolutePath)) {
                return {
                    success: false,
                    error: 'File or directory does not exist'
                };
            }

            const stats = fs.statSync(absolutePath);
            const fileInfo: FileInfo = {
                path: filePath,
                name: path.basename(absolutePath),
                size: stats.size,
                isDirectory: stats.isDirectory(),
                lastModified: stats.mtime,
                extension: stats.isFile() ? path.extname(absolutePath) : undefined
            };
            
            return {
                success: true,
                data: fileInfo,
                message: `File info retrieved: ${filePath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to get file info: ${filePath}`, error);
            
            return {
                success: false,
                error: `Failed to get file info: ${errorMessage}`
            };
        }
    }
}
