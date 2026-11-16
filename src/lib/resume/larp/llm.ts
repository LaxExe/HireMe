export type Completer = (prompt: string) => Promise<string>;

export interface LlmProposalOptions {
  completer?: Completer;
  model?: string;
}
