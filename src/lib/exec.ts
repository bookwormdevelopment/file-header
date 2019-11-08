import { exec as nodeExec, ExecException } from 'child_process';

type ExecSuccessCallback<T> = (lines: string[]) => T;
type ExecErrorCallback<T> = (error: ExecException, stderr: string) => T;

export async function exec<T>(
  command: string,
  callback: ExecSuccessCallback<T>,
  errCallback: ExecErrorCallback<T>
): Promise<T> {
  return new Promise((resolve) => {
    nodeExec(command, (error: ExecException | null, stdout: string, stderr: string) => {
      resolve(
        error ? errCallback(error, stderr) : callback(stdout.split('\n').concat(stderr.split('\n')))
      );
    });
  });
}
