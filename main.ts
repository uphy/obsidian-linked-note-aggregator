import { App, Editor, MarkdownView, Notice, Plugin, TFile, getAllTags } from 'obsidian';

export default class LinkedNoteAggregatorPlugin extends Plugin {

	async onload() {
		// This adds a command that can be triggered anywhere
		this.addCommand({
			id: 'aggregate-linked-notes',
			name: 'Aggregate linked notes to clipboard',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!view.file) {
					new Notice('No active file to process.');
					return;
				}

				const activeFile = view.file;
				let output = '';
				const processedFiles = new Set<string>(); // Keep track of processed file paths
				const filesToProcess: TFile[] = [activeFile];
				const allReferencedFiles = new Set<TFile>(); // All collected referenced files

				// 1. Add content of the active note
				const activeFileContent = await this.app.vault.read(activeFile);
				output += activeFileContent + '\n\n';
				processedFiles.add(activeFile.path);

				// 2. Recursively collect referenced notes
				const referencedByTags: Record<string, TFile[]> = {};

				let currentIndex = 0;
				while (currentIndex < filesToProcess.length) {
					const currentFile = filesToProcess[currentIndex];
					currentIndex++;

					if (!currentFile) continue;

					const fileCache = this.app.metadataCache.getFileCache(currentFile);
					if (!fileCache) continue;

					// 2a. Collect linked notes
					if (fileCache.links) {
						for (const link of fileCache.links) {
							const linkedFilePath = this.app.metadataCache.getFirstLinkpathDest(link.link, currentFile.path);
							if (linkedFilePath instanceof TFile && !processedFiles.has(linkedFilePath.path)) {
								filesToProcess.push(linkedFilePath);
								allReferencedFiles.add(linkedFilePath);
								processedFiles.add(linkedFilePath.path); // Record when added to processing list
							}
						}
					}

					// 2b. Collect notes referenced by tags (Note: getAllTags only gets tags from the current file)
					// To find which notes a tag refers to, we'd need to scan all notes for that tag.
					// This implements logic to add notes related to the current file's tags to referencedByTags.
					const tagsInFile = getAllTags(fileCache);
					if (tagsInFile) {
						for (const tag of tagsInFile) {
							if (!referencedByTags[tag]) {
								referencedByTags[tag] = [];
							}
							// Get all Markdown files and check their tags
							const allMarkdownFiles = this.app.vault.getMarkdownFiles();
							for (const mdFile of allMarkdownFiles) {
								if (mdFile.path === currentFile.path) continue; // Exclude self

								const mdFileCache = this.app.metadataCache.getFileCache(mdFile);
								if (mdFileCache) {
									const tagsInMdFile = getAllTags(mdFileCache);
									if (tagsInMdFile && tagsInMdFile.includes(tag)) {
										if (!referencedByTags[tag].find(f => f.path === mdFile.path)) {
											referencedByTags[tag].push(mdFile);
										}
										if (!processedFiles.has(mdFile.path)) {
											filesToProcess.push(mdFile);
											allReferencedFiles.add(mdFile);
											processedFiles.add(mdFile.path);
										}
									}
								}
							}
						}
					}
				}


				// 3. Add tag information to output
				if (Object.keys(referencedByTags).length > 0) {
					output += '--- tags ---\n';
					for (const tag in referencedByTags) {
						output += `- ${tag}\n`;
						if (referencedByTags[tag].length > 0) {
							for (const file of referencedByTags[tag]) {
								output += `  - [[${file.basename}]]\n`;
							}
						}
					}
					output += '\n'; // Add a newline after the tags section
				}


				// 4. Add content of each referenced note to output
				for (const file of allReferencedFiles) {
					if (file.path !== activeFile.path) { // Active file already added
						output += `--- file: ${file.name} ---\n`;
						const content = await this.app.vault.read(file);
						output += content + '\n\n'; // Add an extra newline for separation
					}
				}

				// Copy to clipboard
				await navigator.clipboard.writeText(output.trim());
				new Notice('Linked notes aggregated to clipboard!'); // Updated notice message
			}
		});
	}
}

