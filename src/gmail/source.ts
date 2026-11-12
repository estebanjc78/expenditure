export interface MailMessage {
  readonly id: string;
  readonly subject: string;
  /** Sender header, either `a@b.c` or `Name <a@b.c>`. */
  readonly from: string;
  /** Epoch milliseconds. */
  readonly receivedAt: number;
  /** Text or HTML body. */
  readonly body: string;
}

/** Where mails come from. Gmail in production, a fake in tests. */
export interface MailSource {
  /** Message ids matching a Gmail search query, newest first, at most `limit`. */
  listMessageIds(query: string, limit: number): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage>;
}
