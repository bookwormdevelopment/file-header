import * as vscode from 'vscode';
import { FileHeader } from './lib/fileHeader';

export function activate(context: vscode.ExtensionContext) {
	const fh = new FileHeader(context);

	// Register commands
	fh.commands.forEach((command) => {
		context.subscriptions.push(vscode.commands.registerCommand(command.name, command.handler));
	});
}

export function deactivate() {}
