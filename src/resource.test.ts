import { it } from "node:test";
import { strictEqual, notStrictEqual } from "node:assert";
import { Resource } from "./resource.ts";

it("Passes simple test suite", async () => {
  const numberResource = new Resource(
    () => ({ value: Math.random() }),
  );

  const number1 = await numberResource.evaluate();
  const number2 = await numberResource.evaluate();

  strictEqual(typeof number1.value, "number");
  strictEqual(typeof number2.value, "number");
  strictEqual(number1.value, number2.value);

  const number3 = await numberResource.evaluate();
  numberResource.invalidate();
  const number4 = await numberResource.evaluate();

  strictEqual(typeof number3.value, "number");
  strictEqual(typeof number4.value, "number");
  notStrictEqual(number3.value, number4.value);

  const stringResource = new Resource(
    ({ number }) => ({ value: `Number is ${number}` }),
    { number: numberResource },
  );

  const string1 = await stringResource.evaluate();

  strictEqual(string1.value, `Number is ${number4.value}`);

  numberResource.invalidate();
  const string2 = await stringResource.evaluate();

  notStrictEqual(string1.value, string2.value);
});

it("Can pass errorables", async () => {
  const errorableResource = new Resource<number>(
    () => { throw new Error("This is an error"); },
  );

  try {
    await errorableResource.evaluate();
  } catch (error) {
    strictEqual(error, errorableResource.error);
    strictEqual(error instanceof Error, true);
    strictEqual((error?.cause as Error).message, "This is an error");
  }

  const resourceThatAllowsError = new Resource(
    ({ errorable }) => {
      if (errorable === undefined) {
        return { value: "It errored" }
      } else {
        return { value: "It did not error" };
      }
    },
    { errorable: errorableResource },
    { errorables: ["errorable"] },
  );

  const result1 = await resourceThatAllowsError.evaluate();
  strictEqual(result1.value, "It errored");

  const resourceThatDoesNotAllowError = new Resource(
    ({ errorable }) => {
      return { value: `It did not error and has value ${errorable}` };
    },
    { errorable: errorableResource },
  );

  try {
    await resourceThatDoesNotAllowError.evaluate();
  } catch (error) {
    strictEqual(error instanceof Error, true);
    strictEqual((error as Error).cause, errorableResource.error);
  }
});