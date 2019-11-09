# file-header

## Overview
File Header VSCode extension allows adding a **heading** to the currently **active document**.

Although it’s not on feature parity, and most likely it won’t ever be, this extension is a conceptual fork of [Psioniq File Header](https://marketplace.visualstudio.com/items?itemName=psioniq.psi-header&ssr=false#overview); reimplementing most useful features while adding some extras.

If your work revolves around multiple companies, with multiple conventions or requirements you will love the automatic variable value detection capabilities of this extension.

### Why bother creating just another heading extension
While there are multiple extensions solving the same problem, each has it's trade-offs.

Most require extensive configuration and are unable to offer all required template interpolations, some do - but lack any automatization, and some are nearly perfect.

To better understand where i’m coming from, you could give [Psioniq File Header](https://marketplace.visualstudio.com/items?itemName=psioniq.psi-header&ssr=false#overview) a try and see if it fits your needs. It was the main inspiration source of the current extension.

## Features

The list of supported configurations can better illustrate the supported options, but at a glance:
- allows adding a heading into the currently active document at file start, end or current cursor location
- compatible with VSCode Multi Root Workspaces
- supports generic and language specific templates
- allows language level customization of comment blocks (comment start, end, line prefix can be define on a per language basis)
- offers sensitive defaults for most used languages (more language customization coming soon)
- allows automatic headings on newly created files (coming soon)
- allows additional spacing before and after a heading (globally or on a per language basis)
- allows additional text before or after the heading (useful for pre-processor commands for example)
- allows template interpolation using one of the supported [variables]() or [functions]()
- automatic variable value detection:
  - determines the author name and email as:
    - the configuration specified value(s)
    - SCM provider configuration (git supported, more comming soon)
    - OS lever user full name
    - OS level username
  - determines the license text and name as:
    - the configuration specified value(s)
    - the license field's value from package.json:
      - if a SPDX license id is provided, fetches the license details
      - if a 'SEE LICENSE IN' formula is used reads the license file if existing and extracts the license text
  - company detection based on custom license file
- allows adding custom variables for template interpolation (just define them into the configuration `fileheader.variables`)
- allows overriding [variables]() from configuration level
SPDX license ID support

### Commands
This extension adds the following commands to VSCode:

| Command name  | Description  |
|---|---|
| insert  | Adds a new heading to the currently active document if none exists  |

### Variables
The following pre defined variables are supported in template interpolation, keep in mind custom variables can be defined and referenced by identifier:
| Variable Name  | Description  |
|---|---|
| date  | The current date as yyyy-MMM-dd  |
| time  | The current time as HH:mm:ss  |
| filepath  | The fully-qualified name of the file  |
| filerelativepath  | Relative path to the current file within the project (include the file name)  |
| filename  | Current file name (including extension)  |
| filenamebase  | Current file name (excluding extension)  |
| projectpath  | The fully-qualified name of the project/workspace root directory   |
| projectname  | Package.json displayName or name properties value or the projectpath basename if both properites are missing |
| projectversion  | Package.json version property value |
| company | The name of your company or employer as configured or license file detected (coming soon) |
| author  | Specified author name, or SCM determined author, or OS full user name or username |
| authoremail |	Specified author email, or SCM determined email |
| licensetext | The full text of the license determined either based on the SPDX ID or the contents of the referenced license file |
| licensename |	Name of the license, will default to Custom for custom licenses |
| licenseurl |	Url for the license, will default to  '' for custom licenses |
| spdxid |	SPDX License ID as provided in the license fild of package.json or custom for custom licenses |


### Functions
The following functions are supported in heading templates:
| Function Name  | Arguments  | Description |
|---|---|---|
| dateformat  | ([format](https://date-fns.org/v2.7.0/docs/format)?: string)  | Formats the current date based on the provided [date-fns format](https://date-fns.org/v2.7.0/docs/format). |
| filecreated  | ([format](https://date-fns.org/v2.7.0/docs/format)?: string)  | Formats the file creation date based on the provided [date-fns format](https://date-fns.org/v2.7.0/docs/format). |

## Extension Settings

This extension contributes the following settings:
- fileheader.mode: Determines if the heading insertion mode as either contextual (inserted at cursor location), file top or bottom.
- fileheader.separate.before: Determines the number of white lines to be added before the heading
- fileheader.separate.after: Determines the number of white lines to be added after the heading
- fileheader.license.id: License SPDX id or Custom to provide your own. A value of Inherit is provided initially allowing probing based on package.json or a LICENSE.md
- fileheader.license.text: Custom license textual content.
- fileheader.variables: A map of variables to be used in templates, can override build in variables.
- fileheader.variables.author.name: Author's name.
- fileheader.variables.author.username: Author's username.
- fileheader.variables.author.email: Author's email address.
- fileheader.variables.company: Author's company/employer.
- fileheader.config.resolve.author: Author's resolve order. By default configuration is prefered over SCM, SCM over fullname and fullname over username
- fileheader.languages: Language level configuration
- fileheader.templates: Language specific or global(*) templates.
## Release Notes

### 1.0.0

Initial release of File Header adding the base functionality and some of the intended automations.
