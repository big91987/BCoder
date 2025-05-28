import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult, FileInfo } from './types';
import { SecurityManager } from '../security/securityManager';
import { logger } from '../utils/logger';

/**
 * 列出目录文件工具
 */
export class ListFilesTool implements Tool {
    name = 'list_files';
    description = 'List files and directories in a given path';
    parameters = [
        {
            name: 'path',
            type: 'string' as const,
            description: 'Path to the directory to list',
            required: true
        },
        {
            name: 'recursive',
            type: 'boolean' as const,
            description: 'Whether to list files recursively',
            required: false,
            default: false
        },
        {
            name: 'include_hidden',
            type: 'boolean' as const,
            description: 'Whether to include hidden files',
            required: false,
            default: false
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const dirPath = args.path as string;
        const recursive = args.recursive as boolean || false;
        const includeHidden = args.include_hidden as boolean || false;

        try {
            // 安全验证
            const permission = await this.securityManager.validateDirectoryAccess(dirPath);
            if (!permission.granted) {
                return {
                    success: false,
                    error: `Permission denied: ${permission.reason}`
                };
            }

            const absolutePath = path.resolve(dirPath);
            const files = this.listDirectory(absolutePath, recursive, includeHidden);
            
            logger.info(`Listed ${files.length} files in: ${dirPath}`);
            
            return {
                success: true,
                data: {
                    path: dirPath,
                    files: files,
                    count: files.length
                },
                message: `Found ${files.length} files in ${dirPath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to list directory: ${dirPath}`, error);
            
            return {
                success: false,
                error: `Failed to list directory: ${errorMessage}`
            };
        }
    }

    private listDirectory(dirPath: string, recursive: boolean, includeHidden: boolean): FileInfo[] {
        const files: FileInfo[] = [];
        
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
                    const fileInfo: FileInfo = {
                        path: fullPath,
                        name: entry,
                        size: stats.size,
                        isDirectory: stats.isDirectory(),
                        lastModified: stats.mtime,
                        extension: stats.isFile() ? path.extname(entry) : undefined
                    };
                    
                    files.push(fileInfo);
                    
                    // 递归处理子目录
                    if (recursive && stats.isDirectory()) {
                        const subFiles = this.listDirectory(fullPath, recursive, includeHidden);
                        files.push(...subFiles);
                    }
                } catch (error) {
                    // 跳过无法访问的文件
                    logger.warn(`Cannot access file: ${fullPath}`, error);
                }
            }
        } catch (error) {
            logger.error(`Cannot read directory: ${dirPath}`, error);
        }
        
        return files;
    }
}

/**
 * 创建目录工具
 */
export class CreateDirectoryTool implements Tool {
    name = 'create_directory';
    description = 'Create a new directory';
    parameters = [
        {
            name: 'path',
            type: 'string' as const,
            description: 'Path of the directory to create',
            required: true
        },
        {
            name: 'recursive',
            type: 'boolean' as const,
            description: 'Whether to create parent directories if they do not exist',
            required: false,
            default: true
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const dirPath = args.path as string;
        const recursive = args.recursive as boolean ?? true;

        try {
            // 安全验证
            const permission = this.securityManager.validatePath(dirPath);
            if (!permission.granted) {
                return {
                    success: false,
                    error: `Permission denied: ${permission.reason}`
                };
            }

            const absolutePath = path.resolve(dirPath);
            
            // 检查目录是否已存在
            if (fs.existsSync(absolutePath)) {
                return {
                    success: false,
                    error: 'Directory already exists'
                };
            }

            // 创建目录
            fs.mkdirSync(absolutePath, { recursive });
            
            logger.info(`Directory created: ${dirPath}`);
            
            return {
                success: true,
                data: {
                    path: dirPath,
                    created: true
                },
                message: `Successfully created directory: ${dirPath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to create directory: ${dirPath}`, error);
            
            return {
                success: false,
                error: `Failed to create directory: ${errorMessage}`
            };
        }
    }
}

/**
 * 移动/重命名文件工具
 */
export class MoveFileTool implements Tool {
    name = 'move_file';
    description = 'Move or rename a file or directory';
    parameters = [
        {
            name: 'source',
            type: 'string' as const,
            description: 'Source path of the file or directory',
            required: true
        },
        {
            name: 'destination',
            type: 'string' as const,
            description: 'Destination path',
            required: true
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const sourcePath = args.source as string;
        const destPath = args.destination as string;

        try {
            // 安全验证源路径
            const sourcePermission = this.securityManager.validatePath(sourcePath);
            if (!sourcePermission.granted) {
                return {
                    success: false,
                    error: `Source permission denied: ${sourcePermission.reason}`
                };
            }

            // 安全验证目标路径
            const destPermission = this.securityManager.validatePath(destPath);
            if (!destPermission.granted) {
                return {
                    success: false,
                    error: `Destination permission denied: ${destPermission.reason}`
                };
            }

            const absoluteSource = path.resolve(sourcePath);
            const absoluteDest = path.resolve(destPath);
            
            // 检查源文件是否存在
            if (!fs.existsSync(absoluteSource)) {
                return {
                    success: false,
                    error: 'Source file or directory does not exist'
                };
            }

            // 检查目标是否已存在
            if (fs.existsSync(absoluteDest)) {
                return {
                    success: false,
                    error: 'Destination already exists'
                };
            }

            // 确保目标目录存在
            const destDir = path.dirname(absoluteDest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            // 移动文件
            fs.renameSync(absoluteSource, absoluteDest);
            
            logger.info(`File moved: ${sourcePath} -> ${destPath}`);
            
            return {
                success: true,
                data: {
                    source: sourcePath,
                    destination: destPath
                },
                message: `Successfully moved: ${sourcePath} -> ${destPath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to move file: ${sourcePath} -> ${destPath}`, error);
            
            return {
                success: false,
                error: `Failed to move file: ${errorMessage}`
            };
        }
    }
}

/**
 * 删除文件工具
 */
export class DeleteFileTool implements Tool {
    name = 'delete_file';
    description = 'Delete a file or directory';
    parameters = [
        {
            name: 'path',
            type: 'string' as const,
            description: 'Path to the file or directory to delete',
            required: true
        },
        {
            name: 'recursive',
            type: 'boolean' as const,
            description: 'Whether to delete directories recursively',
            required: false,
            default: false
        }
    ];

    constructor(private securityManager: SecurityManager) {}

    async execute(args: Record<string, any>): Promise<ToolResult> {
        const filePath = args.path as string;
        const recursive = args.recursive as boolean || false;

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
            
            // 检查文件是否存在
            if (!fs.existsSync(absolutePath)) {
                return {
                    success: false,
                    error: 'File or directory does not exist'
                };
            }

            const stats = fs.statSync(absolutePath);
            
            if (stats.isDirectory()) {
                if (recursive) {
                    fs.rmSync(absolutePath, { recursive: true, force: true });
                } else {
                    fs.rmdirSync(absolutePath);
                }
            } else {
                fs.unlinkSync(absolutePath);
            }
            
            logger.info(`File deleted: ${filePath}`);
            
            return {
                success: true,
                data: {
                    path: filePath,
                    wasDirectory: stats.isDirectory()
                },
                message: `Successfully deleted: ${filePath}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to delete file: ${filePath}`, error);
            
            return {
                success: false,
                error: `Failed to delete file: ${errorMessage}`
            };
        }
    }
}
