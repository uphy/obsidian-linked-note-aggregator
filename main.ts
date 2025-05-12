import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, getAllTags, parseFrontMatterTags } from 'obsidian';

interface LinkedNoteAggregatorPluginSettings {
	ignoredTags: string;
	ignoredDirectories: string;
}

const DEFAULT_SETTINGS: LinkedNoteAggregatorPluginSettings = {
	ignoredTags: '',
	ignoredDirectories: ''
}

export default class LinkedNoteAggregatorPlugin extends Plugin {
	settings: LinkedNoteAggregatorPluginSettings;

	async onload() {
		await this.loadSettings();

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
				const processedFiles = new Set<string>();
				const filesToProcess: TFile[] = [activeFile];
				const allReferencedFiles = new Set<TFile>();

				const ignoredTagsArray = this.settings.ignoredTags.split('\n').map(tag => tag.trim()).filter(tag => tag !== '');
				const ignoredDirectoriesArray = this.settings.ignoredDirectories.split('\n').map(dir => dir.trim()).filter(dir => dir !== '');

				// Function to check if a file should be ignored based on frontmatter tags or directory
				const shouldIgnoreFile = (file: TFile): boolean => {
					// Check ignored directories
					for (const ignoredDir of ignoredDirectoriesArray) {
						if (file.path.startsWith(ignoredDir)) {
							return true;
						}
					}
					// Check ignored tags in frontmatter
					const fileCache = this.app.metadataCache.getFileCache(file);
					if (fileCache?.frontmatter) {
						const frontmatterTags = parseFrontMatterTags(fileCache.frontmatter);
						if (frontmatterTags) {
							for (const tag of frontmatterTags) {
								if (ignoredTagsArray.includes(tag.startsWith('#') ? tag.substring(1) : tag)) {
									return true;
								}
							}
						}
					}
					return false;
				};

				// 1. Add content of the active note (if not ignored)
				if (!shouldIgnoreFile(activeFile)) {
					const activeFileContent = await this.app.vault.read(activeFile);
					output += activeFileContent + '\n\n';
					processedFiles.add(activeFile.path);
				} else {
					new Notice(`Active file "${activeFile.basename}" is ignored based on settings.`);
					// If the active file itself is ignored, we might want to stop or handle differently.
					// For now, we'll just not include it and proceed with linked files if any.
				}


				// 2. Recursively collect referenced notes
				const referencedByTags: Record<string, TFile[]> = {};
				let currentIndex = 0;

				// Start processing loop only if the active file was not ignored or if we decide to process its links anyway
				// For this example, we'll proceed to check its links even if the active file content is ignored.
				// filesToProcess still contains the activeFile initially.
				while (currentIndex < filesToProcess.length) {
					const currentFile = filesToProcess[currentIndex];
					currentIndex++;
					if (!currentFile || shouldIgnoreFile(currentFile) && currentFile.path !== activeFile.path) {
						if(currentFile && currentFile.path !== activeFile.path) processedFiles.add(currentFile.path);
						continue;
					}

					const fileCache = this.app.metadataCache.getFileCache(currentFile);
					if (!fileCache) continue;

					// 2a. Collect linked notes
					if (fileCache.links) {
						for (const link of fileCache.links) {
							const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, currentFile.path);
							if (linkedFile instanceof TFile && !processedFiles.has(linkedFile.path)) {
								if (!shouldIgnoreFile(linkedFile)) {
									filesToProcess.push(linkedFile);
									allReferencedFiles.add(linkedFile);
								}
								processedFiles.add(linkedFile.path);
							}
						}
					}

					if (currentFile.path === activeFile.path || !shouldIgnoreFile(currentFile)) {
						if (fileCache.tags) {
							for (const tagCache of fileCache.tags) {
								const tagName = tagCache.tag.startsWith('#') ? tagCache.tag.substring(1) : tagCache.tag;
								if (ignoredTagsArray.includes(tagName)) continue;
				
								if (!referencedByTags[tagCache.tag]) {
									referencedByTags[tagCache.tag] = [];
								}
				
								const allMarkdownFiles = this.app.vault.getMarkdownFiles();
								for (const mdFile of allMarkdownFiles) {
									if (mdFile.path === currentFile.path || processedFiles.has(mdFile.path)) continue;
									if (shouldIgnoreFile(mdFile)) {
										processedFiles.add(mdFile.path);
										continue;
									}
				
									const mdFileCache = this.app.metadataCache.getFileCache(mdFile);
									if (mdFileCache?.tags) {
										const tagsInMdFile = mdFileCache.tags.map(t => t.tag);
										if (tagsInMdFile.includes(tagCache.tag)) {
											if (!referencedByTags[tagCache.tag].find(f => f.path === mdFile.path)) {
												referencedByTags[tagCache.tag].push(mdFile);
											}
											if (!filesToProcess.find(f => f.path === mdFile.path) && !allReferencedFiles.has(mdFile)) {
												filesToProcess.push(mdFile);
												allReferencedFiles.add(mdFile);
											}
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
						// Filter out files associated with this tag if they were ultimately ignored
						const validFilesForTag = referencedByTags[tag].filter(f => !shouldIgnoreFile(f) && allReferencedFiles.has(f));
						if (validFilesForTag.length > 0) {
							output += `- ${tag}\n`;
							for (const file of validFilesForTag) {
								output += `  - [[${file.basename}]]\n`;
							}
						}
					}
					output += '\n';
				}


				// 4. Add content of each referenced note to output
				// Ensure active file content is only added if it wasn't ignored initially
				let activeFileContentAdded = output.includes(await this.app.vault.cachedRead(activeFile));

				for (const file of allReferencedFiles) {
					if (file.path === activeFile.path && activeFileContentAdded) continue; // Already added and not ignored
					if (shouldIgnoreFile(file)) continue; // Double check, though already filtered

					output += `--- file: ${file.name} ---\n`;
					const content = await this.app.vault.read(file);
					output += content + '\n\n';
				}

				if (output.trim() === "") {
					new Notice('No content to aggregate based on current settings and links.');
					return;
				}

				await navigator.clipboard.writeText(output.trim());
				new Notice('Linked notes aggregated to clipboard!');
			}
		});

		this.addSettingTab(new LinkedNoteAggregatorSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class LinkedNoteAggregatorSettingTab extends PluginSettingTab {
	plugin: LinkedNoteAggregatorPlugin;

	constructor(app: App, plugin: LinkedNoteAggregatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Linked Note Aggregator Settings' });

		new Setting(containerEl)
			.setName('Ignored Tags')
			.setDesc('Enter tags to ignore, one tag per line. Notes with these tags will not be processed (e.g., #archive, #todo).')
			.addTextArea(text => text
				.setPlaceholder('Enter tags here (one per line)\n#private\n#ignore-this-tag')
				.setValue(this.plugin.settings.ignoredTags)
				.onChange(async (value) => {
					this.plugin.settings.ignoredTags = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Ignored Directories')
			.setDesc('Enter directory paths to ignore, one path per line. Notes within these directories (and their subdirectories) will not be processed (e.g., Temp/, DailyNotes/Archive/).')
			.addTextArea(text => text
				.setPlaceholder('Enter directory paths here (one per line)\nPersonal/Private/\n_archive/')
				.setValue(this.plugin.settings.ignoredDirectories)
				.onChange(async (value) => {
					this.plugin.settings.ignoredDirectories = value;
					await this.plugin.saveSettings();
				}));
	}
}
