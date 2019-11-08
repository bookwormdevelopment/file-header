import { statSync, readFileSync, existsSync } from 'fs';
import { relative, basename, extname, join } from 'path';

import * as vscode from 'vscode';
import { format as dateFormat } from 'date-fns';
import { sync as usernameSync } from 'username';
import fullname from 'fullname';
import * as spdx from 'spdx-license-list/full';
import wordwrap from 'wordwrap';
import { exec } from './exec';

interface ICommands {
    name: string;
    handler(...args: any[]): any;
}

export class FileHeader {
    public static CommandPrefix = 'file-header.';

    public static TemplateSeparatorPrefix = '<<';
    public static TemplateSeparatorSufix = '>>';
    public static TemplateVariableRegExp = /(<<[^>>]+>>)/g;

    public static FnParamSanitization = /[\'\"]/g;

    public static DefaultYearFmt = 'yyyy';
    public static DefaultMonthFmt = 'MMM';
    public static DefaultDayFmt = 'dd';
    public static DefaultDateFmt = `${FileHeader.DefaultYearFmt}-${FileHeader.DefaultMonthFmt}-${FileHeader.DefaultDayFmt}`;

    public static DefaultHourFmt = 'HH';
    public static DefaultMinuteFmt = 'mm';
    public static DefaultSecondFmt = 'ss';
    public static DefaultTimeFmt = `${FileHeader.DefaultHourFmt}:${FileHeader.DefaultMinuteFmt}:${FileHeader.DefaultSecondFmt}`;

    public static SCM = ['git', 'mercurial', 'perforce', 'svn'];

    public static WordWrap = wordwrap(120);

    private context: vscode.ExtensionContext;

    public constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Commands getter
     */
    public get commands(): ICommands[] {
        return [
            {
                name: `${FileHeader.CommandPrefix}insert`,
                handler: this.onInsert.bind(this),
            },
        ];
    }

    /**
     * Insertion handler
     */
    private async onInsert() {
        const document = this.activeDocument;

        if (document && !this.hasHeading(document)) {
            // Get a reference to the currently active editor
            const editor = await vscode.window.showTextDocument(document);

            // Compute the heading
            const heading = await this.computeHeading(document);

            // Add the heading at configured position
            editor.edit((editBuilder) => {
                editBuilder.insert(this.determinePosition(editor, document), heading);
            });
        }

        vscode.window.showInformationMessage('About to insert things');
    }

    /**
     * Gets the currently active editor's document
     */
    private get activeDocument() {
        const activeEditor = vscode.window.activeTextEditor;

        if (activeEditor) {
            return activeEditor.document;
        }

        return null;
    }

    /**
     * FileHeader workspace configuration getter
     */
    private get configuration() {
        return vscode.workspace.getConfiguration('fileheader');
    }

    /**
     * Checks if the current document has a heading already defined
     */
    private hasHeading(document: vscode.TextDocument | null) {
        // TODO: Determine if the heading is pressent or not using a full text search or likelyhood index

        return false;
    }

    /**
     * Computes a heading in the context of the provided document
     */
    private async computeHeading(d: vscode.TextDocument): Promise<string> {
        // Extract language specific configuration options
        const languages = this.extractLanguagesConfiguration();
        const lang = languages[d.languageId] || languages['*'];

        // Determine the before and after contents
        const before = [
            // Content
            ...lang.block.before,

            // Spacing
            ...lang.separate.before > -1 ?
                new Array(lang.separate.before).fill('') :
                new Array(this.configuration.get('separate.before') || 0),
        ];

        const after = [
            // Content
            ...lang.block.after,

            // Spacing
            ...lang.separate.after > -1 ?
                new Array(lang.separate.after).fill('') :
                new Array(this.configuration.get('separate.after') || 0),
        ];

        // Extract language specific template
        const templates = this.extractTemplatesConfiguration();
        const template = (templates[d.languageId] || templates['*']).template;

        // Construct the contents
        const contents: string[] = [];

        // Compute the template one line at a time
        const computeTemplate = this.computeTemplate(template, d);
        for await (const l of computeTemplate) {
            contents.push(l);
        }


        return [
            ...before,
            lang.block.start,
            ...contents.map((c) => `${lang.block.line} ${c}`),
            lang.block.end,
            ...after,
        ].join('\n');
    }

    /**
     * Determine the final position for the generated heading
     */
    private determinePosition(editor: vscode.TextEditor, document: vscode.TextDocument) {
        let position: vscode.Position;

        switch (this.configuration.get('mode')) {
            case 'contextual':
                // Contextual heading insertion based on provided configuration
                position = editor.selection.start;

                break;

            case 'bottom':
                // File end heading insertion based on provided configuration
                position = new vscode.Position(document.lineCount + 1, 0);
                break;


            case 'top':
            default:
                    // File start heading insertion based on provided configuration
                    position = new vscode.Position(0, 0);
                    break;
        }

        return position;
    }

    /**
     * Extracts all languages configuration
     */
    private extractLanguagesConfiguration() {
        const languages: ILanguageConfiguration[] | undefined = this.configuration.get('languages');

        if (languages) {
            return languages.reduce((all, l) => {
                all[l.language] = l;

                return all;
            }, {} as { [language: string]: ILanguageConfiguration });
        }

        return {};
    }

    /**
     * Extract all templates configuration
     */
    private extractTemplatesConfiguration() {
        const templates: ITemplateConfiguration[] | undefined = this.configuration.get('templates');

        if (templates) {
            return templates.reduce((all, t) => {
                all[t.language] = t;

                return all;
            }, {} as { [language: string]: ITemplateConfiguration });
        }

        return {};
    }

    /**
     * Computes the template one line at a time asyncronously
     */
    private async * computeTemplate(template: string[], document: vscode.TextDocument): AsyncGenerator<string> {
        const n = template.length;
        let i = 0;

        const cache: Variables = {
            // Populate the variables cache with existing configurations
            ...this.configuration.get('variables'),
        };

        while (i < n) {
            let line = template[i];

            // Extract the line's variables and determine their values
            const lineVariables = await Promise.all(
                this.extractVariables(line).map(async (v) => {
                    // Handle variables while reusing caching
                    if (!('parameters' in v) && typeof cache[v.name] === 'string') {
                        v.value = cache[v.name];

                        return Promise.resolve(v);
                    } else {
                        switch (v.name) {
                            case 'date':
                            case 'year':
                            case 'month':
                            case 'day':
                                // Format the desired date portion
                                v.value = this.computeDateFormat(
                                    cache,
                                    v.name === 'year' ? FileHeader.DefaultYearFmt :
                                    v.name === 'day' ? FileHeader.DefaultDayFmt :
                                    v.name === 'month' ? FileHeader.DefaultMonthFmt :
                                    FileHeader.DefaultDateFmt
                                );

                                break;

                            case 'time':
                            case 'hour':
                            case 'minute':
                            case 'second':
                                // Format the desired time portion
                                v.value = this.computeDateFormat(
                                    cache,
                                    v.name === 'hour' ? FileHeader.DefaultHourFmt :
                                    v.name === 'minute' ? FileHeader.DefaultMinuteFmt :
                                    v.name === 'second' ? FileHeader.DefaultSecondFmt :
                                    FileHeader.DefaultTimeFmt
                                );

                                break;

                            case 'dateformat':
                                // Format date in the desired format
                                v.value = this.computeDateFormat(
                                    cache,
                                    (v as ITemplateFunction).parameters[0] || FileHeader.DefaultDateFmt,
                                );

                                break;

                            case 'filecreated':
                                // Handle the document scheme
                                if (document.uri.scheme === 'file') {
                                    // Format the file creation date as specified
                                    v.value = this.computeDateFormat(
                                        { date: statSync(document.uri.fsPath).birthtime } as Variables,
                                        (v as ITemplateFunction).parameters[0] || FileHeader.DefaultDateFmt
                                    );
                                } else {
                                    // Non file uri scheme, handle later maybe?
                                    vscode.window.showErrorMessage(`Unimplemented URI scheme ${document.uri.scheme} filecreated timestamp extraction requested for: ${document.uri.path}`);
                                }

                                break;

                            case 'author':
                            case 'authoremail':
                                // Determine the author details based on the specified resolution mechanism
                                await this.computeAuthorDetails(cache, document);

                                v.value = cache[v.name] || v.value;

                                break;

                            case 'username':
                                // Determine the author's username
                                v.value = this.computeUsername(cache) || v.value;

                                break;

                            case 'filepath':
                            case 'filerelativepath':
                            case 'filename':
                            case 'filenamebase':
                            case 'projectpath':
                                // Determine the path variables
                                this.computePaths(cache, document);

                                v.value = cache[v.name] || v.value;

                                break;

                            case "licensetext":
                            case "licensename":
                            case "licenseurl":
                            case "spdxid":
                                // Determine the license variables
                                this.computeLicense(cache, document);

                                v.value = cache[v.name] || v.value;

                                break;

                            case 'projectname':
                            case 'projectversion':
                                // Determine the project details
                                this.computeProjectDetails(cache, document);

                                v.value = cache[v.name] || v.value;

                                break;

                            default:
                                // Unable to determine the parameter value
                                // as it's an unrecognised parameter without a defined value in settings
                                break;
                        }

                        // Determine the value in place while forwarding cache
                        return Promise.resolve(v);
                    }
                }),
            );

            // Replace variables in the current line
            lineVariables.forEach((v, i) => {
                line = `${line.slice(0, v.pos.start)}${new Array(v.pos.end - v.pos.start).fill(i).join('')}${line.slice(v.pos.end)}`;
            });
            lineVariables.forEach((v, i) => {
                line = line.replace(new RegExp(`[${i}]+`, 'g'), v.value);
            });

            i += 1;

            yield line;
        }
    }

    /**
     * Given a template line extracts the functions and variables inside it
     */
    private extractVariables(line: string) {
        const variables: Array<ITemplateVariable | ITemplateFunction> = [];

        for (const v of line.matchAll(FileHeader.TemplateVariableRegExp)) {
            const name = v[0].slice(FileHeader.TemplateSeparatorPrefix.length, v[0].length - FileHeader.TemplateSeparatorSufix.length);
            const start = v.index as number;

            // Discern between variables and functions
            if (!name.indexOf('dateformat') || !name.indexOf('filecreated')) {
                // Isolated a function
                const fnName = !name.indexOf('dateformat') ? 'dateformat' : 'filecreated';

                variables.push({
                    name: fnName,
                    pos: { start, end: start + v[0].length },
                    value: v[0],
                    parameters: this.extractFunctionParameters(name.slice(fnName.length)),
                });
            } else {
                // Isolated a variable
                variables.push({
                    name,
                    pos: { start, end: start + v[0].length },
                    value: v[0],
                });
            }
        }

        return variables;
    }

    /**
     * Given a fucntion call expression, extracts the function parameters
     */
    private extractFunctionParameters(callExpression: string) {
        const parameters: string[] = [];

        if (callExpression.length && callExpression.indexOf('(') === 0 && callExpression[callExpression.length - 1] === ')') {
            const ce = callExpression.slice(1, callExpression.length -1);
            const n = ce.length;
            let i = 0;
            let start = 0;

            while (i < n) {
                const c = ce[i];

                if (c === ',' && ce[i - 1] !== '\\') {
                    // Add the new parameter to the list
                    parameters.push(
                        ce.slice(start, i).replace(FileHeader.FnParamSanitization, ''),
                    );

                    start = i;
                }

                i += 1;
            }

            // Add the last parameter also
            if (i !== start) {
                const lastParam = ce.slice(start, i).trim().replace(FileHeader.FnParamSanitization, '');

                if (lastParam) {
                    parameters.push(lastParam);
                }
            }
        }

        return parameters;
    }

    /**
     * Formats the date based on specified format
     */
    private computeDateFormat(cache: Variables, format: string) {
        // Cache the current date if not done already
        cache.date = cache.date || new Date();

        let formatted: string = '';

        try {
            formatted = dateFormat(cache.date, format);
        } catch (e) {
            vscode.window.showErrorMessage(`Invalid date format, check out date-fns for format documentation. ${e.message}`, 'https://date-fns.org/v2.7.0/docs/format');
        }

        return formatted;
    }

    /**
     * Determine the author details and store them into cache
     */
    private async computeAuthorDetails(cache: Variables, document: vscode.TextDocument) {
        const resolvePolicy: string[] | undefined = this.configuration.get('config.resolve.author');
        let author: string = '';
        let authorEmail: string = '';

        if (resolvePolicy) {
            // Use policies in specified order to resolve the author's details
            const resolve = this.resolvePolicy(resolvePolicy, cache, document);

            for await (const resolution of resolve) {
                author = author || resolution.author;
                authorEmail = authorEmail || resolution.authorEmail;

                if (author && authorEmail) {
                    // Stop once all details have been resolved
                    break;
                }
            }
        }

        cache.author = author;
        cache.authoremail = authorEmail;
    }

    /**
     * Given a resolve policy for the author details, resolves the details in the order specified
     * by the policy async
     */
    private async * resolvePolicy(resolvePolicy: string[], cache: Variables, document: vscode.TextDocument) {
        let i = 0;
        const n = resolvePolicy.length;
        const resolved: { author: string, authorEmail: string } = {
            // Initialize the resolved details with cached values if any
            author: typeof cache.author === 'string' ? cache.author : '',
            authorEmail: typeof cache.authoremail === 'string' ? cache.authoremail : '',
        };

        while (i < n) {
            const policy = resolvePolicy[i];

            switch (policy) {
                case 'config':
                    // Grab the values as specified in configuration
                    resolved.author = resolved.author || this.configuration.get('variables.author.name') || '';


                    // Only resolve the author email if not already resolved
                    resolved.authorEmail = resolved.authorEmail || this.configuration.get('variables.author.email') || '';

                    break;

                case 'scm':
                    // Grab the values as specified by the SCM in use
                    if (!cache.projectpath) {
                        // Compute the paths before testing SCM's
                        this.computePaths(cache, document);
                    }

                    const scm = this.scmResolvePolicy(FileHeader.SCM);
                    for await (const r of scm) {
                        resolved.author = resolved.author || r.author;
                        resolved.authorEmail = resolved.authorEmail || r.authorEmail;

                        if (resolved.author && resolved.authorEmail) {
                            // Stop early once the first SCM has resolved the author and author's email
                            break;
                        }
                    }

                    break;

                case 'fullname':
                    // Grab the full author name
                    resolved.author = resolved.author || await fullname() || '';

                    break;

                case 'username':
                    // Compute the username as the author's name
                    resolved.author = resolved.author || this.computeUsername(cache);

                    break;

                default:
                    vscode.window.showErrorMessage(`Invalid policy ${policy} specified as author resolve policy.`);
                    break;
            }

            i += 1;

            yield resolved;
        }
    }

    private async * scmResolvePolicy(scms: string[]) {
        let i = 0;
        const n = scms.length;

        const resolved = { author: '', authorEmail : '' };

        while (i < n) {
            const scm = scms[i];

            switch (scm) {
                // Git based SCM
                case 'git':
                    // Check git command's existence
                    const exists = await exec(
                        `git --version`,
                        () => true,
                        () => false,
                    );

                    if (!exists) {
                        // Stop early if there is not GIT executable
                        break;
                    }

                    // Attempt to get the author name
                    if (!resolved.author) {
                        const authors = await Promise.all(['user.name', 'author.name', 'committer.name'].map((configOption) => {
                            return exec<string>(
                                `git config --get ${configOption}`,
                                (lines) => lines.map((l) => l.trim()).filter((l) => l.length)[0] || '',
                                () => '',
                            );
                        }));

                        resolved.author = authors.map((a) => a.trim()).filter((a) => a.length)[0] || '';
                    }

                    // Attempt to get the author email
                    if (!resolved.authorEmail) {
                        const authorEmails = await Promise.all(['user.email', 'author.email', 'committer.email'].map((configOption) => {
                            return exec<string>(
                                `git config --get ${configOption}`,
                                (lines) => lines.map((l) => l.trim()).filter((l) => l.length)[0] || '',
                                () => '',
                            );
                        }));

                        resolved.authorEmail = authorEmails.map((a) => a.trim()).filter((a) => a.length)[0] || '';
                    }

                    break;

                case 'mercurial':
                    // TODO: Implement mercurial resolver

                    break;

                case 'perforce':
                    // TODO: Implement perforce resolver

                    break;

                case 'svn':
                    // TODO: Implement svn resolver

                    break;

                default:
                    // Unsupported SCM
                    vscode.window.showErrorMessage(`Unsupported SCM ${scm} specified as author details SCM resolve policy.`);
                    break;
            }

            i += 1;

            yield resolved;
        }
    }

    /**
     * Determines the current user's name
     */
    private computeUsername(cache: Variables) {
        const username = usernameSync() || '';

        // Cache the username
        cache.username = username || '';

        return cache.username;
    }

    /**
     * Determines the current file and workspace paths
     */
    private computePaths(cache: Variables, document: vscode.TextDocument) {
        cache.filepath = document.uri.fsPath;
        cache.filename = basename(document.uri.fsPath);
        cache.filenamebase = basename(document.uri.fsPath, extname(document.uri.fsPath));

        // Determine workspace related paths
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspace) {
            cache.projectpath = workspace.uri.fsPath;
            cache.filerelativepath = relative(workspace.uri.fsPath, cache.filepath);
        }
    }

    /**
     * Determines the project details
     */
    private computeProjectDetails(cache: Variables, document: vscode.TextDocument) {
        if (!cache.projectpath) {
            // Compute the paths to allow project details detection
            this.computePaths(cache, document);
        }

        if (cache.projectpath) {
            // Read package json and extract project details
            const packageJSON = this.getPackageJson<{ version?: string; displayName?: string; name?: string; }>(cache.projectpath);

            cache.projectversion = packageJSON.version || '';
            cache.projectname = packageJSON.displayName || packageJSON.name || basename(cache.projectpath);
        }
    }

    private computeLicense(cache: Variables, document: vscode.TextDocument) {
        if (!cache.projectpath) {
            // Compute the paths to allow license details detection
            this.computePaths(cache, document);
        }

        const spdxId = cache.spdxid || this.configuration.get('license.id');

        if (spdxId === 'Inherit' && cache.projectpath) {
            // Read package json to allow project license inheritance
            const packageJSON = this.getPackageJson<{ license: string }>(cache.projectpath);

            if (packageJSON.license) {
                const licenseInFile = packageJSON.license.indexOf('SEE LICENSE IN');

                if (licenseInFile > -1) {
                    // Custom license or textualy specified license
                    const licenseFile = join(cache.projectpath, packageJSON.license.slice(licenseInFile + 14).trim());

                    // Custom license case
                    cache.spdxid = cache.licensename = 'Custom';
                    cache.licenseurl = '';

                    if (existsSync(licenseFile)) {
                        // Custom license file detected
                        cache.licensetext = readFileSync(licenseFile, { encoding: 'utf-8' });
                    } else {
                        // Custom license but unable to interpret the reference
                        vscode.window.showErrorMessage(`Invalid license SPDX id or non standard license file reference. Please consider using the standard "SEE LICENSE IN <LICENSE_FILE.ext>" format.`);

                        cache.licensetext = '';
                    }
                } else {
                    // SPDX id based license
                    cache.spdxid = packageJSON.license;
                }
            }
        } else if (spdxId !== 'Custom') {
            // Determine the license details based on the spdx id
            if (spdxId in spdx) {
                const license = (spdx as any)[spdxId] as ILicense;

                cache.licensename = license.name;
                cache.licenseurl = license.url;
                cache.licensetext = FileHeader.WordWrap(license.licenseText);
                cache.spdxid = spdxId;
            }
        } else {
            // Custom license case based on configuration
            cache.licensename = spdxId;
            cache.spdxid = spdxId;
            cache.licenseurl = '';
            cache.licensetext = this.configuration.get('license.text') || '';
        }
    }

    /**
     * Given a path reads and parses the package.json file in path or return an empty object
     */
    private getPackageJson<T>(projectPath: string): Partial<T> {
        let packageJSON: Partial<T> = {};

        try {
            packageJSON = JSON.parse(
                readFileSync(join(projectPath, 'package.json'), { encoding: 'utf-8'} ),
            );
        } catch (_) {
            // No package json found at the base of the current workspace
        }

        return packageJSON;
    }
}
