import type { Context, Vertex } from "@wildboar/meerkat-types";
import {
    HierarchicalAgreement,
} from "@wildboar/x500/src/lib/modules/HierarchicalOperationalBindings/HierarchicalAgreement.ta";
import type {
    SuperiorToSubordinateModification,
} from "@wildboar/x500/src/lib/modules/HierarchicalOperationalBindings/SuperiorToSubordinateModification.ta";
import {
    MasterAndShadowAccessPoints,
} from "@wildboar/x500/src/lib/modules/HierarchicalOperationalBindings/SubordinateToSuperior.ta";
import {
    _encode_MasterOrShadowAccessPoint,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/MasterOrShadowAccessPoint.ta";
import type {
    DistinguishedName,
} from "@wildboar/x500/src/lib/modules/InformationFramework/DistinguishedName.ta";
import type {
    RelativeDistinguishedName as RDN,
} from "@wildboar/x500/src/lib/modules/InformationFramework/RelativeDistinguishedName.ta";
import findEntry from "../../x500/findEntry";
import rdnToJson from "../../x500/rdnToJson";
import valuesFromAttribute from "../../x500/valuesFromAttribute";
import { Knowledge } from "@prisma/client";
import deleteEntry from "../../database/deleteEntry";
import { DER } from "asn1-ts/dist/node/functional";
import createEntry from "../../database/createEntry";
import getDistinguishedName from "../../x500/getDistinguishedName";
import addAttributes from "../../database/entry/addAttributes";
import removeAttribute from "../../database/entry/removeAttribute";
import {
    objectClass,
} from "@wildboar/x500/src/lib/modules/InformationFramework/objectClass.oa";
import {
    entryACI,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/entryACI.oa";
import {
    prescriptiveACI,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/prescriptiveACI.oa";
import {
    subentryACI,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/subentryACI.oa";
import {
    administrativeRole,
} from "@wildboar/x500/src/lib/modules/InformationFramework/administrativeRole.oa";
import {
    accessControlScheme,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/accessControlScheme.oa";
import {
    commonName,
} from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/commonName.oa";
import {
    subtreeSpecification,
} from "@wildboar/x500/src/lib/modules/InformationFramework/subtreeSpecification.oa";

/**
 * @description
 *
 * This is for RECEIVING an update to the CP, not creating one.
 *
 * @param ctx
 * @param oldAgreement
 * @param newAgreement
 * @param init
 * @param mod
 * @returns
 */
export
async function updateContextPrefix (
    ctx: Context,
    oldAgreement: HierarchicalAgreement,
    mod: SuperiorToSubordinateModification,
): Promise<void> {

    // Because we use the agreement's RDN to find the entry, it's critical that
    // the agreement in the database is kept in sync with the entry's RDN.
    const oldDN: DistinguishedName = [
        ...oldAgreement.immediateSuperior,
        oldAgreement.rdn,
    ];

    const oldCP = await findEntry(ctx, ctx.dit.root, oldDN); // FIXME: I think you could just search for the immediate superior.
    if (!oldCP) {
        throw new Error(); // FIXME:
    }

    const oldImmediateSuperior = oldCP.immediateSuperior;
    let currentOld: Vertex | undefined = oldImmediateSuperior;
    if (!currentOld) {
        throw new Error(); // FIXME:
    }
    while (
        currentOld
        && currentOld.immediateSuperior
        && !currentOld.immediateSuperior.dse.entry
    ) {
        currentOld = currentOld.immediateSuperior;
    }
    const highestDseThatSuperiorDSAMayModify: Vertex | undefined = currentOld;
    if (!highestDseThatSuperiorDSAMayModify) {
        throw new Error();
    }
    const highestModifiableDN = getDistinguishedName(highestDseThatSuperiorDSAMayModify);

    await ctx.db.entry.update({
        where: {
            id: oldCP.dse.id,
        },
        data: {
            deleteTimestamp: new Date(),
            immediate_superior_id: null,
        },
    });

    // Mark the subordinate DSE / CP as "deleted" and set its immediate_superior_id to `null`.
    // Modify the context prefix.
    // "Un-delete" the subordinate DSE and set its immediate_superior_id to the new superior.
    // Reload the DIT, starting from the first DSE the HOB superior could not modify.

    let currentRoot = highestDseThatSuperiorDSAMayModify;
    // Can you trust mod.contextPrefixInfo.length? Yes, because the superior DSA may move its entries.
    for (let i = highestModifiableDN.length - 1; i < mod.contextPrefixInfo.length; i++) {
        const vertex = mod.contextPrefixInfo[i];
        const last: boolean = (mod.contextPrefixInfo.length === (i + 1));
        const immSuprAccessPoints: MasterAndShadowAccessPoints | undefined = vertex.accessPoints;
        const immSupr: boolean = Boolean(immSuprAccessPoints && last);
        const existingEntry = await findEntry(ctx, currentRoot, [ vertex.rdn ]);
        if (!existingEntry) {
            const createdEntry = await createEntry(
                ctx,
                currentRoot,
                vertex.rdn,
                {
                    glue: (!vertex.admPointInfo && !vertex.accessPoints),
                    rhob: Boolean(vertex.admPointInfo),
                    immSupr,
                    AccessPoint: immSupr
                        ? {
                            createMany: {
                                data: vertex.accessPoints
                                    ? vertex.accessPoints.map((ap) => ({
                                        ae_title: ap.ae_title.rdnSequence.map((rdn) => rdnToJson(rdn)),
                                        knowledge_type: Knowledge.SPECIFIC,
                                        category: ap.category,
                                        chainingRequired: ap.chainingRequired,
                                        ber: Buffer.from(_encode_MasterOrShadowAccessPoint(ap, DER).toBytes()),
                                    }))
                                    : [],
                            }
                        }
                        : undefined,
                },
                vertex.admPointInfo?.flatMap(valuesFromAttribute) ?? [],
                [],
            );
            for (const subentry of (vertex.subentries ?? [])) {
                await createEntry(
                    ctx,
                    createdEntry,
                    subentry.rdn,
                    {
                        subentry: true,
                        rhob: true,
                    },
                    subentry.info?.flatMap(valuesFromAttribute) ?? [],
                    [],
                );
            }
            const oldRDN: RDN = oldAgreement.immediateSuperior[i];
            const oldVertex = await findEntry(ctx, currentRoot, [ oldRDN ]);
            if (oldVertex) {
                await deleteEntry(ctx, oldVertex);
            }
            currentRoot = createdEntry;
        } else {
            currentRoot = existingEntry;
            if (vertex.admPointInfo) {
                const deletions = (
                    await Promise.all(
                        vertex.admPointInfo
                            .map((attr) => removeAttribute(ctx, currentRoot, attr.type_, []))
                    )
                ).flat();
                await ctx.db.$transaction([
                    ctx.db.attributeValue.deleteMany({
                        where: {
                            entry_id: currentRoot.dse.id,
                        },
                    }),
                    ...deletions,
                    ...await addAttributes(ctx, currentRoot, vertex.admPointInfo, []), // FIXME: modifiersName
                ]);
                for (const subentry of vertex.subentries ?? []) {
                    const oldSubentry = await findEntry(ctx, currentRoot, [ subentry.rdn ]);
                    if (!oldSubentry) {
                        await createEntry(
                            ctx,
                            currentRoot,
                            subentry.rdn,
                            {
                                subentry: true,
                                rhob: true,
                            },
                            subentry.info?.flatMap(valuesFromAttribute) ?? [],
                            [],
                        );
                        continue;
                    }
                    const subentryDeletions = (
                        await Promise.all(
                            [
                                commonName["&id"],
                                subtreeSpecification["&id"],
                                prescriptiveACI["&id"],
                            ]
                                .map((type_) => removeAttribute(ctx, oldSubentry, type_, [])),
                        )
                    ).flat();
                    const subentryInfoDeletions = (
                        await Promise.all(
                            subentry.info
                                .map((attr) => removeAttribute(ctx, oldSubentry, attr.type_, []))
                        )
                    ).flat();
                    await ctx.db.$transaction([
                        ctx.db.attributeValue.deleteMany({
                            where: {
                                entry_id: oldSubentry.dse.id,
                            },
                        }),
                        ...subentryDeletions,
                        ...subentryInfoDeletions,
                        ...await addAttributes(ctx, currentRoot, subentry.info, []), // FIXME: modifiersName
                    ]);
                }
            } else { // This point is no longer an administrative point, or never was.
                const deletions = (
                    await Promise.all(
                        [
                            administrativeRole["&id"],
                            accessControlScheme["&id"],
                            subentryACI["&id"],
                        ]
                            .map((type_) => removeAttribute(ctx, currentRoot, type_, [])),
                    )
                ).flat();
                await ctx.db.$transaction(deletions);
            }
            if (currentRoot.dse.shadow) {
                continue; // We don't modify shadow entries.
            }
        }
    }

    if (mod.immediateSuperiorInfo) {
        const deletions = (
            await Promise.all(
                mod.immediateSuperiorInfo
                    .filter((attr) => (
                        attr.type_.isEqualTo(objectClass["&id"])
                        || attr.type_.isEqualTo(entryACI["&id"])
                    ))
                    .map((attr) => removeAttribute(ctx, currentRoot, attr.type_, []))
            )
        ).flat();
        await ctx.db.$transaction([
            // ctx.db.attributeValue.deleteMany({
            //     where: {
            //         entry_id: currentRoot.dse.id,
            //     },
            // }),
            ...deletions,
            ...await addAttributes(ctx, currentRoot, mod.immediateSuperiorInfo, []), // FIXME: modifiersName
        ]);
    }

    // This should not be present in a Sup2SubModification.
    // if (sup2sub.entryInfo) {
    //     const values = sup2sub.entryInfo.flatMap((attr) => valuesFromAttribute(attr));
    //     await writeEntryAttributes(ctx, subr, values);
    // }

    await ctx.db.entry.update({
        where: {
            id: oldCP.dse.id,
        },
        data: {
            deleteTimestamp: null,
            immediate_superior_id: currentRoot.dse.id,
        },
    });

    // TODO: Update the knowledge references of the root DSE (supr) if the highest NC has changed.
    // TODO: I think you need supr knowledge in the root DSE.
}

export default updateContextPrefix;
