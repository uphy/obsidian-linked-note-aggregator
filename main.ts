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
				const processedFiles = new Set<string>(); // Keep track of processed file paths
				const filesToProcess: TFile[] = [activeFile];
				const allReferencedFiles = new Set<TFile>(); // All collected referenced files

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
					return false;
				};

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

					if (!currentFile) {
						continue;
					}

					const fileCache = this.app.metadataCache.getFileCache(currentFile);
					if (!fileCache) {
						continue;
					}

					// 2a. Collect linked notes
					if (fileCache.links) {
						for (const link of fileCache.links) {
							const linkedFilePath = this.app.metadataCache.getFirstLinkpathDest(link.link, currentFile.path);
							if (linkedFilePath instanceof TFile && !processedFiles.has(linkedFilePath.path) && !shouldIgnoreFile(linkedFilePath)) {
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
							if (ignoredTagsArray.includes(tag)) {
								continue; // Skip ignored tags
							}
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
