# Obsidian Linked Note Aggregator

This plugin provides a command to recursively copy the content of the active note and all notes linked from it (directly or indirectly via links and tags) to the clipboard. It also allows users to specify tags and directories to ignore during the aggregation process.

## Features

- **Copy Active Note**: The content of the currently active note is included at the beginning of the output.
- **Recursive Link Following**: It traverses through all wikilinks in the active note and subsequently linked notes to gather their content.
- **Tag-Based Note Collection**: It identifies notes that share the same tags as the processed notes and includes their content as well.
- **Organized Output**:
    - The content of the active note appears first.
    - An optional `*** tags ***` section lists all unique tags found in the processed notes, along with the notes that contain each tag.
    - An optional `*** referenced files ***` section lists all unique files referenced through links and tags.
    - Each subsequently referenced note's content is appended, preceded by a `*** file: Note Name ***` separator.
- **Avoids Duplicates**: Each note is processed and included only once, even if it's linked or tagged multiple times.
- **Ignore Functionality**:
    - **Ignored Tags**: Specify tags (one per line) in the settings. Notes containing any of these tags in their frontmatter will not be processed or included by tag collection. Tag collection itself will also ignore these tags.
    - **Ignored Directories**: Specify directory paths (one per line) in the settings. Notes within these directories (and their subdirectories) will not be processed.

## How to Use

1.  Open a note in Obsidian.
2.  Trigger the command palette (usually `Ctrl+P` or `Cmd+P`).
3.  Search for and select the command: "**Aggregate linked notes to clipboard**".
4.  The content of the active note, all recursively linked notes, and notes referenced by shared tags (excluding ignored ones) will be copied to your clipboard.
5.  A notice will confirm that the notes have been copied.

## Settings

You can configure the plugin's behavior by going to Obsidian's settings and finding "Linked Note Aggregator".

-   **Ignored Tags**:
    -   Enter tags that you want the plugin to ignore during aggregation.
    -   Each tag should be on a new line (e.g., `#archive`, `#todo`).
    -   Notes that contain any of these tags will be skipped.
    -   Tags listed here will also be excluded from the tag collection process.
-   **Ignored Directories**:
    -   Enter directory paths that you want the plugin to ignore.
    -   Each path should be on a new line (e.g., `Temp/`, `DailyNotes/Archive/`).
    -   Notes located within these directories (including any subdirectories) will be skipped.

## Development

To make changes to this plugin:

1.  Clone this repository (or your fork).
2.  Navigate to the plugin directory.
3.  Run `npm i` or `yarn` to install dependencies.
4.  Run `npm run dev` to start compilation in watch mode.
5.  This will create/update `main.js` in the project root. You'll need to copy this `main.js` and the `manifest.json` to your vault's plugin folder (`YourVault/.obsidian/plugins/your-plugin-id/`) or use a tool/script to automate this.

## License

This plugin is released under the [MIT License](LICENSE).
