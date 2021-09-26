import type { Context } from "../types";
import type {
    NameAndOptionalUID,
} from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/NameAndOptionalUID.ta";
import { member } from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/member.oa";
import { uniqueMember } from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/uniqueMember.oa";
import { groupOfNames } from "@wildboar/x500/src/lib/modules/SelectedObjectClasses/groupOfNames.oa";
import { groupOfUniqueNames } from "@wildboar/x500/src/lib/modules/SelectedObjectClasses/groupOfUniqueNames.oa";
import {
    _decode_DistinguishedName,
} from "@wildboar/x500/src/lib/modules/InformationFramework/DistinguishedName.ta";
import type EqualityMatcher from "@wildboar/x500/src/lib/types/EqualityMatcher";
import type { OBJECT_IDENTIFIER } from "asn1-ts";
import findEntry from "../x500/findEntry";
import compareDistinguishedName from "@wildboar/x500/src/lib/comparators/compareDistinguishedName";
import readValues from "../database/entry/readValues";
import {
    EntryInformationSelection,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/EntryInformationSelection.ta";

const GROUP_OF_NAMES: string = groupOfNames["&id"].toString();
const GROUP_OF_UNIQUE_NAMES: string = groupOfUniqueNames["&id"].toString();

export
function getIsGroupMember (
    ctx: Context,
    getEqualityMatcher: (attributeType: OBJECT_IDENTIFIER) => EqualityMatcher | undefined,
): (
    userGroup: NameAndOptionalUID,
    user: NameAndOptionalUID,
) => Promise<boolean | undefined> {
    return async function (
        userGroup: NameAndOptionalUID,
        user: NameAndOptionalUID,
    ): Promise<boolean | undefined> {
        const groupEntry = await findEntry(ctx, ctx.dit.root, userGroup.dn);
        if (
            !groupEntry?.dse.objectClass.has(GROUP_OF_NAMES)
            && !groupEntry?.dse.objectClass.has(GROUP_OF_UNIQUE_NAMES)
        ) {
            return undefined;
        }
        const { userAttributes: groupAttributes } = await readValues(ctx, groupEntry, new EntryInformationSelection(
            {
                select: [
                    member["&id"],
                    uniqueMember["&id"],
                ],
            },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
        ));
        // TODO: Review what to do about the unique identifier.
        for (const attr of groupAttributes) {
            if (attr.id.isEqualTo(member["&id"])) {
                const decodedValue = _decode_DistinguishedName(attr.value);
                if (compareDistinguishedName(decodedValue, user.dn, getEqualityMatcher)) {
                    return true;
                }
            } else if (attr.id.isEqualTo(uniqueMember["&id"])) {
                const decodedValue = uniqueMember.decoderFor["&Type"]!(attr.value);
                if (compareDistinguishedName(decodedValue.dn, user.dn, getEqualityMatcher)) {
                    return true;
                }
            }
        }
        return false;
    }
}

export default getIsGroupMember;
