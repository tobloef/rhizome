export class CustomError extends Error {
  constructor(
    message?: string,
    extra?: { cause?: Error },
  ) {
    super(message, extra);
    this.name = this.constructor.name;
  }
}