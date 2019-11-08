
interface ILanguageConfiguration {
    language: string;

    block: {
        start: string;
        end: string;
        line: string;
        before: string[];
        after: string[];
    };

    separate: {
        before: number;
        after: number;
    };
}

interface ITemplateConfiguration {
    language: string;
    template: string[];
}

type DateVariables = 'date' | 'year' | 'month'  | 'day';

type TimeVariables = 'time' | 'hour' | 'minute' | 'second';

type PathVariables = 'filepath' | 'filerelativepath' | 'filename' | 'filenamebase' | 'projectpath';

type ProjectVariables = 'projectname' | 'projectversion';

type AuthorVariables = 'company' | 'author' | 'username' | 'authoremail';

type LicenseVariables = 'licensetext' | 'licensename' | 'licenseurl' | 'spdxid';

type DateFunctions = 'dateformat' | 'filecreated';

type VariableType = DateVariables | TimeVariables | PathVariables | ProjectVariables | AuthorVariables | LicenseVariables;

type FunctionType = DateFunctions;

type SystemVariables = {
    [v in VariableType]?: any;
};

interface ICustomVariables {
    [variable: string]: string;
}

type Variables = SystemVariables & ICustomVariables;

interface ITemplateVariable {
    name: VariableType | string;

    pos: ITemplatePosition;

    value: string;
}

interface ITemplateFunction {
    name: FunctionType;

    pos: ITemplatePosition;

    parameters: string[];

    value: string;
}

interface ITemplatePosition {
    start: number;
    end: number;
}