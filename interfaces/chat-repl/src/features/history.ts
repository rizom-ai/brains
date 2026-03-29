export class CommandHistory {
  private history: string[] = [];
  private index = -1;
  private maxSize = 1000;

  add(command: string): void {
    // Don't add empty commands or duplicates of the last command
    if (!command.trim() || command === this.history[this.history.length - 1]) {
      return;
    }

    this.history.push(command);

    // Limit history size
    if (this.history.length > this.maxSize) {
      this.history.shift();
    }

    this.index = this.history.length;
  }

  previous(): string | undefined {
    if (this.index > 0) {
      this.index--;
      return this.history[this.index];
    }
    return this.history[0];
  }

  next(): string | undefined {
    if (this.index < this.history.length - 1) {
      this.index++;
      return this.history[this.index];
    }

    // If we're at the end, return empty string
    if (this.index === this.history.length - 1) {
      this.index = this.history.length;
      return "";
    }

    return undefined;
  }

  getAll(): string[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.index = -1;
  }

  search(query: string): string[] {
    return this.history.filter((cmd) =>
      cmd.toLowerCase().includes(query.toLowerCase()),
    );
  }
}
