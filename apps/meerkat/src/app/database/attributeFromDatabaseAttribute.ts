import type { Context, StoredAttributeValueWithContexts } from "../types";
import type { AttributeValue, ContextValue } from "@prisma/client";
import { ObjectIdentifier, BERElement } from "asn1-ts";

export
async function attributeFromDatabaseAttribute (
    ctx: Context,
    attr: AttributeValue & { ContextValue: ContextValue[] },
): Promise<StoredAttributeValueWithContexts> {
    // TODO: Convert OIDs in the database to Int[]
    const value = new BERElement();
    value.fromBytes(attr.ber);
    const contexts: StoredAttributeValueWithContexts["contexts"] = new Map();
    attr.ContextValue.forEach((c) => {
        const CONTEXT_OID: string = c.type.map((n) => n.toString()).join(".");
        const el = new BERElement();
        el.fromBytes(c.ber);
        const group = contexts.get(CONTEXT_OID);
        if (!group) {
            contexts.set(CONTEXT_OID, {
                id: new ObjectIdentifier(c.type),
                fallback: c.fallback,
                values: [ el ],
            });
        } else {
            group.values.push(el);
        }
    });
    attr.ContextValue.map((c) => [
        c.type.map((n) => n.toString()).join("."),
        {
            id: new ObjectIdentifier(c.type),
            fallback: c.fallback,
            values: (() => {
                const el = new BERElement();
                el.fromBytes(c.ber);
                return el;
            })(),
        },
    ]);
    return {
        entry: "",
        id: new ObjectIdentifier(attr.type.split(".").map(Number.parseInt)),
        value,
        contexts,
    };
}

export default attributeFromDatabaseAttribute;
