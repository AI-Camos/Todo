import { describe, it, expect } from "vitest";
import { parseId } from "./route";

// `describe` agrupa tests relacionados. `it` (alias de `test`) es un caso.
// `expect(x).toBe(y)` es la aserción: si no se cumple, el test falla.
describe("parseId", () => {
  it("convierte un string numérico en número", () => {
    expect(parseId("123")).toBe(123);
    expect(parseId("1")).toBe(1);
  });

  it("devuelve null si no es un entero válido", () => {
    expect(parseId("abc")).toBeNull();
    expect(parseId("")).toBeNull();
    expect(parseId("1.5")).toBeNull(); // decimales no son enteros
    expect(parseId("12x")).toBeNull();
  });
});
