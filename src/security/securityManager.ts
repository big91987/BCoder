import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SecurityContext, PermissionRequest, PermissionResult } from '../tools/types';
import { logger } from '../utils/logger';

/**
 * 安全管理器 - 负责文件访问权限和路径安全验证
 */
export class SecurityManager {
    private context: SecurityContext;
    private readonly maxFileSize = 10 * 1024 * 1024; // 10MB

    constructor(workspaceRoot: string) {
        this.context = {
            workspaceRoot: workspaceRoot,
            allowedPaths: [workspaceRoot],
            deniedPaths: [
                path.join(workspaceRoot, 'node_modules'),
                path.join(workspaceRoot, '.git'),
                path.join(workspaceRoot, '.vscode'),
                path.join(workspaceRoot, 'dist'),
                path.join(workspaceRoot, 'build'),
                path.join(workspaceRoot, 'out')
            ],
            maxFileSize: this.maxFileSize
        };
    }

    /**
     * 验证文件路径是否安全
     */
    validatePath(filePath: string): PermissionResult {
        try {
            // 解析绝对路径
            const absolutePath = path.resolve(filePath);
            
            // 检查是否在工作区内
            if (!this.isPathInWorkspace(absolutePath)) {
                return {
                    granted: false,
                    reason: 'Path is outside workspace'
                };
            }

            // 检查是否在拒绝列表中
            if (this.isPathDenied(absolutePath)) {
                return {
                    granted: false,
                    reason: 'Path is in denied list'
                };
            }

            // 检查路径遍历攻击
            if (this.hasPathTraversal(filePath)) {
                return {
                    granted: false,
                    reason: 'Path traversal detected'
                };
            }

            return {
                granted: true,
                autoApproved: true
            };
        } catch (error) {
            logger.error('Path validation error:', error);
            return {
                granted: false,
                reason: 'Invalid path format'
            };
        }
    }

    /**
     * 验证文件读取权限
     */
    async validateFileRead(filePath: string): Promise<PermissionResult> {
        const pathResult = this.validatePath(filePath);
        if (!pathResult.granted) {
            return pathResult;
        }

        try {
            const absolutePath = path.resolve(filePath);
            
            // 检查文件是否存在
            if (!fs.existsSync(absolutePath)) {
                return {
                    granted: false,
                    reason: 'File does not exist'
                };
            }

            // 检查是否是文件（不是目录）
            const stats = fs.statSync(absolutePath);
            if (!stats.isFile()) {
                return {
                    granted: false,
                    reason: 'Path is not a file'
                };
            }

            // 检查文件大小
            if (stats.size > this.context.maxFileSize) {
                return {
                    granted: false,
                    reason: `File too large (${stats.size} bytes, max ${this.context.maxFileSize})`
                };
            }

            return {
                granted: true,
                autoApproved: true
            };
        } catch (error) {
            logger.error('File read validation error:', error);
            return {
                granted: false,
                reason: 'File access error'
            };
        }
    }

    /**
     * 验证文件写入权限
     */
    async validateFileWrite(filePath: string): Promise<PermissionResult> {
        const pathResult = this.validatePath(filePath);
        if (!pathResult.granted) {
            return pathResult;
        }

        try {
            const absolutePath = path.resolve(filePath);
            const directory = path.dirname(absolutePath);
            
            // 检查目录是否存在，如果不存在是否可以创建
            if (!fs.existsSync(directory)) {
                return {
                    granted: false,
                    reason: 'Parent directory does not exist'
                };
            }

            // 检查目录写入权限
            try {
                fs.accessSync(directory, fs.constants.W_OK);
            } catch {
                return {
                    granted: false,
                    reason: 'No write permission to directory'
                };
            }

            return {
                granted: true,
                autoApproved: true
            };
        } catch (error) {
            logger.error('File write validation error:', error);
            return {
                granted: false,
                reason: 'File write validation failed'
            };
        }
    }

    /**
     * 验证目录操作权限
     */
    async validateDirectoryAccess(dirPath: string): Promise<PermissionResult> {
        const pathResult = this.validatePath(dirPath);
        if (!pathResult.granted) {
            return pathResult;
        }

        try {
            const absolutePath = path.resolve(dirPath);
            
            // 检查目录是否存在
            if (!fs.existsSync(absolutePath)) {
                return {
                    granted: false,
                    reason: 'Directory does not exist'
                };
            }

            // 检查是否是目录
            const stats = fs.statSync(absolutePath);
            if (!stats.isDirectory()) {
                return {
                    granted: false,
                    reason: 'Path is not a directory'
                };
            }

            return {
                granted: true,
                autoApproved: true
            };
        } catch (error) {
            logger.error('Directory validation error:', error);
            return {
                granted: false,
                reason: 'Directory access error'
            };
        }
    }

    /**
     * 检查路径是否在工作区内
     */
    private isPathInWorkspace(absolutePath: string): boolean {
        const workspaceRoot = path.resolve(this.context.workspaceRoot);
        return absolutePath.startsWith(workspaceRoot);
    }

    /**
     * 检查路径是否在拒绝列表中
     */
    private isPathDenied(absolutePath: string): boolean {
        return this.context.deniedPaths.some(deniedPath => {
            const resolvedDeniedPath = path.resolve(deniedPath);
            return absolutePath.startsWith(resolvedDeniedPath);
        });
    }

    /**
     * 检查路径遍历攻击
     */
    private hasPathTraversal(filePath: string): boolean {
        const normalized = path.normalize(filePath);
        return normalized.includes('..') || normalized.includes('~');
    }

    /**
     * 获取安全上下文
     */
    getSecurityContext(): SecurityContext {
        return { ...this.context };
    }

    /**
     * 更新安全配置
     */
    updateSecurityContext(updates: Partial<SecurityContext>): void {
        this.context = { ...this.context, ...updates };
        logger.info('Security context updated', updates);
    }
}
