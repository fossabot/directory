import type { Context, Vertex } from "@wildboar/meerkat-types";
import vertexFromDatabaseEntry from "../database/entryFromDatabaseEntry";
import type { Prisma } from "@prisma/client";

export
async function readChildren (
    ctx: Context,
    entry: Vertex,
    take?: number,
    skip?: number,
    cursorId?: number,
    where?: Partial<Prisma.EntryWhereInput>,
): Promise<Vertex[]> {
    if (entry.dse.subentry || entry.dse.alias) {
        return []; // These types should never have children. This return is to prevent errors.
    }
    if (!entry.subordinates) {
        return Promise.all(
            (await ctx.db.entry.findMany({
                take: take ?? 1000000, // You MUST specify a "take" number when using a cursor.
                skip: ((cursorId !== undefined) ? 1 : 0) + (skip ?? 0),
                cursor: (cursorId !== undefined)
                    ? {
                        id: cursorId,
                    }
                    : undefined,
                where: {
                    ...(where ?? {}),
                    immediate_superior_id: entry.dse.id,
                    deleteTimestamp: null,
                },
                orderBy: {
                    id: "asc",
                },
            })).map((child) => vertexFromDatabaseEntry(ctx, entry, child, true)),
        );
    }
    if (cursorId !== undefined) {
        let caughtUp: boolean = false;
        return entry
            .subordinates
            .filter((sub) => {
                if (sub.dse.id === cursorId) {
                    caughtUp = true;
                    return false; // We skip the current subordinate.
                } else {
                    return caughtUp;
                }
            });
    }
    return entry
        .subordinates
        ;
}

export default readChildren;
