import { describe, it } from "node:test";
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