import { describe, expect, it } from "vitest";
import { isValidCNPJ, isValidCPF, formatDocument, maskDocument, normalizeDocument } from "@/lib/document";
import { genCNPJ, genCPF } from "./helpers";

describe("CPF", () => {
  it("aceita CPFs válidos, com ou sem máscara", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
    for (let i = 0; i < 20; i++) expect(isValidCPF(genCPF())).toBe(true);
  });
  it("rejeita dígitos verificadores errados, repetidos e tamanhos incorretos", () => {
    expect(isValidCPF("529.982.247-24")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("123")).toBe(false);
    expect(isValidCPF("abcdefghijk")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita CNPJ numérico válido", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    for (let i = 0; i < 20; i++) expect(isValidCNPJ(genCNPJ())).toBe(true);
  });
  it("aceita CNPJ alfanumérico (exemplo oficial da Receita Federal)", () => {
    expect(isValidCNPJ("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCNPJ("12ABC34501DE35")).toBe(true);
  });
  it("rejeita dígitos errados e repetidos", () => {
    expect(isValidCNPJ("11.222.333/0001-82")).toBe(false);
    expect(isValidCNPJ("00000000000000")).toBe(false);
    expect(isValidCNPJ("12ABC34501DE36")).toBe(false);
  });
});

describe("formatação", () => {
  it("normaliza, formata e mascara", () => {
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(maskDocument("52998224725")).toBe("***.982.***-**");
  });
});
