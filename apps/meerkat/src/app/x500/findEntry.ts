import type { DistinguishedName } from "@wildboar/x500/src/lib/modules/InformationFramework/DistinguishedName.ta";
import type { Context, DIT, Vertex, IndexableOID, ANY } from "../types";
import readChildren from "../dit/readChildren";

// TODO: Return the number of RDNs that matched, whether aliases were derefed.
// TODO: Accept neverDerefAliases, derefInSearching, derefFindingBaseObj, derefAlways
// TODO: Drill into database if entries are not in memory.
// TODO: Ignore entries whose deletionTimestamp is set.
// TODO: Return referrals / continuation references.

export
async function findEntry (
    ctx: Context,
    dit: DIT,
    dn: DistinguishedName,
    derefAliases: boolean = true,
): Promise<Vertex | undefined> {
    const currentVertex = derefAliases
        ? (dit.dse.alias
            ? await findEntry(ctx, dit, dit.dse.alias.aliasedEntryName, derefAliases)
            : dit)
        : dit;
    if (!currentVertex) {
        return undefined;
    }
    const children = await readChildren(ctx, dit);
    if ((currentVertex.dse.rdn.length === 0) && (dn.length === 0)) {
        return currentVertex;
    }
    if (currentVertex.dse.rdn.length === 0) { // Root DSE, which will not match.
        return children // So we start the search with its children.
            .map((child) => findEntry(ctx, child, dn, derefAliases))
            .find((e) => e);
    }
    // To minimize modification by reference.
    const query: DistinguishedName = [ ...dn ];
    const queriedRDN = query.shift();
    if (!queriedRDN) {
        return undefined;
    }
    if (queriedRDN.length !== dit.dse.rdn.length) {
        return undefined;
    }
    const ditRDN: Map<IndexableOID, ANY> = new Map(dit.dse.rdn.map((atav) => [ atav.type_.toString(), atav.value ]));
    const everyATAVMatched: boolean = queriedRDN.every((atav) => {
        const TYPE_OID: string = atav.type_.toString();
        const spec = ctx.attributes.get(TYPE_OID);
        if (!spec) {
            return false;
        }
        const matcher = spec.namingMatcher;
        if (!matcher) {
            return false;
        }
        const ditValue = ditRDN.get(TYPE_OID);
        if (!ditValue) {
            return false;
        }
        const queriedValue = atav.value;
        return matcher(queriedValue, ditValue);
    });
    if (!everyATAVMatched) {
        return undefined;
    }
    if (query.length === 0) {
        return dit; // We matched the last RDN of the query.
    }
    /**
     * Otherwise, we repeat the process by querying each child vertex of the DIT
     * with a distinguished name whose terminal RDN has been truncated.
     */
    return children // So we start the search with its children.
        .map((child) => findEntry(ctx, child, query, derefAliases))
        .find((e) => e);
}

export default findEntry;
