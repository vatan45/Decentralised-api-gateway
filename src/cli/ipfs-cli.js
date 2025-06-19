#!/usr/bin/env node

const ipfsService = require('../services/ipfs');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

class IPFSCLI {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Main CLI entry point
     */
    async run() {
        const command = process.argv[2];
        const args = process.argv.slice(3);

        try {
            switch (command) {
                case 'upload':
                    await this.uploadFile(args[0]);
                    break;
                case 'download':
                    await this.downloadFile(args[0], args[1]);
                    break;
                case 'info':
                    await this.getFileInfo(args[0]);
                    break;
                case 'pin':
                    await this.pinContent(args[0]);
                    break;
                case 'unpin':
                    await this.unpinContent(args[0]);
                    break;
                case 'health':
                    await this.healthCheck();
                    break;
                case 'cache-stats':
                    await this.getCacheStats();
                    break;
                case 'clear-cache':
                    await this.clearCache();
                    break;
                case 'interactive':
                    await this.interactiveMode();
                    break;
                default:
                    this.showHelp();
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    /**
     * Upload file to IPFS
     */
    async uploadFile(filePath) {
        if (!filePath) {
            throw new Error('File path is required');
        }

        console.log(`Uploading file: ${filePath}`);

        const content = await fs.readFile(filePath, 'utf8');
        const fileName = path.basename(filePath);

        const metadata = {
            fileName,
            originalPath: filePath,
            uploadMethod: 'cli'
        };

        const result = await ipfsService.uploadApiCode(content, metadata);

        console.log('Upload successful!');
        console.log(`CID: ${result.cid}`);
        console.log(`Size: ${result.size} bytes`);
        console.log(`Content Hash: ${result.contentHash}`);
        console.log(`Upload Time: ${result.uploadTimestamp}`);
    }

    /**
     * Download file from IPFS
     */
    async downloadFile(cid, outputPath) {
        if (!cid) {
            throw new Error('CID is required');
        }

        if (!ipfsService.validateCID(cid)) {
            throw new Error('Invalid CID format');
        }

        console.log(`Downloading file. CID: ${cid}`);

        const data = await ipfsService.getApiCode(cid);

        if (!outputPath) {
            outputPath = `downloaded_${Date.now()}.js`;
        }

        await fs.writeFile(outputPath, data.code);

        console.log('Download successful!');
        console.log(`File saved to: ${outputPath}`);
        console.log(`Content Hash: ${data.metadata.contentHash}`);
        console.log(`Original File: ${data.metadata.fileName || 'Unknown'}`);
    }

    /**
     * Get file information
     */
    async getFileInfo(cid) {
        if (!cid) {
            throw new Error('CID is required');
        }

        if (!ipfsService.validateCID(cid)) {
            throw new Error('Invalid CID format');
        }

        console.log(`Getting file info. CID: ${cid}`);

        const info = await ipfsService.getFileInfo(cid);
        const isAvailable = await ipfsService.isContentAvailable(cid);

        console.log('File Information:');
        console.log(`CID: ${info.cid}`);
        console.log(`Size: ${info.size} bytes`);
        console.log(`Type: ${info.type}`);
        console.log(`Blocks: ${info.blocks}`);
        console.log(`Available: ${isAvailable ? 'Yes' : 'No'}`);
    }

    /**
     * Pin content
     */
    async pinContent(cid) {
        if (!cid) {
            throw new Error('CID is required');
        }

        console.log(`Pinning content. CID: ${cid}`);
        await ipfsService.pinContent(cid);
        console.log('Content pinned successfully');
    }

    /**
     * Unpin content
     */
    async unpinContent(cid) {
        if (!cid) {
            throw new Error('CID is required');
        }

        console.log(`Unpinning content. CID: ${cid}`);
        await ipfsService.unpinContent(cid);
        console.log('Content unpinned successfully');
    }

    /**
     * Health check
     */
    async healthCheck() {
        console.log('Performing health check...');
        const health = await ipfsService.healthCheck();

        console.log('Health Status:', health.status);
        if (health.node) {
            console.log('Node ID:', health.node.id);
            console.log('Agent Version:', health.node.agentVersion);
            console.log('Protocol Version:', health.node.protocolVersion);
        }
        if (health.cache) {
            console.log('Cache Files:', health.cache.fileCount);
            console.log('Cache Size:', `${(health.cache.totalSize / 1024 / 1024).toFixed(2)} MB`);
            console.log('Cache Utilization:', `${health.cache.utilization.toFixed(2)}%`);
        }
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        console.log('Getting cache statistics...');
        const stats = await ipfsService.getCacheStats();

        console.log('Cache Statistics:');
        console.log(`Files: ${stats.fileCount}`);
        console.log(`Total Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Max Size: ${(stats.maxSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Utilization: ${stats.utilization.toFixed(2)}%`);
    }

    /**
     * Clear cache
     */
    async clearCache() {
        console.log('Clearing cache...');
        await ipfsService.clearCache();
        console.log('Cache cleared successfully');
    }

    /**
     * Interactive mode
     */
    async interactiveMode() {
        console.log('IPFS CLI Interactive Mode');
        console.log('Type "help" for available commands, "exit" to quit');

        while (true) {
            const input = await this.question('ipfs> ');
            const [command, ...args] = input.trim().split(' ');

            if (command === 'exit' || command === 'quit') {
                break;
            }

            if (command === 'help') {
                this.showInteractiveHelp();
                continue;
            }

            try {
                switch (command) {
                    case 'upload':
                        await this.uploadFile(args[0]);
                        break;
                    case 'download':
                        await this.downloadFile(args[0], args[1]);
                        break;
                    case 'info':
                        await this.getFileInfo(args[0]);
                        break;
                    case 'pin':
                        await this.pinContent(args[0]);
                        break;
                    case 'unpin':
                        await this.unpinContent(args[0]);
                        break;
                    case 'health':
                        await this.healthCheck();
                        break;
                    case 'cache-stats':
                        await this.getCacheStats();
                        break;
                    case 'clear-cache':
                        await this.clearCache();
                        break;
                    default:
                        console.log('Unknown command. Type "help" for available commands.');
                }
            } catch (error) {
                console.error('Error:', error.message);
            }
        }
    }

    /**
     * Ask user a question
     */
    question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    /**
     * Show help for interactive mode
     */
    showInteractiveHelp() {
        console.log('\nAvailable commands:');
        console.log('  upload <file>                    - Upload file to IPFS');
        console.log('  download <cid> [output]          - Download file from IPFS');
        console.log('  info <cid>                       - Get file information');
        console.log('  pin <cid>                        - Pin content');
        console.log('  unpin <cid>                      - Unpin content');
        console.log('  health                           - Health check');
        console.log('  cache-stats                      - Cache statistics');
        console.log('  clear-cache                      - Clear cache');
        console.log('  help                             - Show this help');
        console.log('  exit                             - Exit interactive mode');
        console.log('');
    }

    /**
     * Show CLI help
     */
    showHelp() {
        console.log('IPFS CLI - Decentralized File Storage');
        console.log('');
        console.log('Usage: node ipfs-cli.js <command> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  upload <file>                    - Upload file to IPFS');
        console.log('  download <cid> [output]          - Download file from IPFS');
        console.log('  info <cid>                       - Get file information');
        console.log('  pin <cid>                        - Pin content');
        console.log('  unpin <cid>                      - Unpin content');
        console.log('  health                           - Health check');
        console.log('  cache-stats                      - Cache statistics');
        console.log('  clear-cache                      - Clear cache');
        console.log('  interactive                      - Start interactive mode');
        console.log('');
        console.log('Examples:');
        console.log('  node ipfs-cli.js upload ./api.js');
        console.log('  node ipfs-cli.js download QmHash ./downloaded.js');
        console.log('  node ipfs-cli.js info QmHash');
        console.log('  node ipfs-cli.js interactive');
        console.log('');
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new IPFSCLI();
    cli.run();
}

module.exports = IPFSCLI; 