import {
    Context,
    BindReturn,
    SecurityError,
} from "@wildboar/meerkat-types";
import type { Socket } from "net";
import { TLSSocket } from "tls";
import {
    DirectoryBindArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/DirectoryBindArgument.ta";
import {
    NameAndOptionalUID,
} from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/NameAndOptionalUID.ta";
import findEntry from "../x500/findEntry";
import {
    AuthenticationLevel_basicLevels,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/AuthenticationLevel-basicLevels.ta";
import {
    AuthenticationLevel_basicLevels_level_none,
    AuthenticationLevel_basicLevels_level_simple,
    // AuthenticationLevel_basicLevels_level_strong,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/AuthenticationLevel-basicLevels-level.ta";
import attemptPassword from "../authn/attemptPassword";
import getDistinguishedName from "../x500/getDistinguishedName";
import {
    securityError,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/securityError.oa";
import {
    SecurityErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityErrorData.ta";
import {
    SecurityProblem_unsupportedAuthenticationMethod,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityProblem.ta";
import createSecurityParameters from "../x500/createSecurityParameters";

/**
 * @summary X.500 Directory Access Protocol (DSP) bind operation
 * @description
 *
 * ## Technical Details
 *
 * This function waits a random amount of time to prevent timing attacks.
 *
 * Anonymous authentication shall always succeed, even if bound entry does not
 * actually exist. This is so anonymous authentication cannot be used to
 * enumerate directory entries.
 *
 * @param ctx
 * @param creds
 * @returns `null` if the authentication failed.
 */
export
async function bind (
    ctx: Context,
    socket: Socket | TLSSocket,
    arg: DirectoryBindArgument,
): Promise<BindReturn> {
    const tlsProtocol: string | null = ("getProtocol" in socket)
        ? socket.getProtocol()
        : null;
    const localQualifierPoints: number = (
        0
        + ((socket instanceof TLSSocket) ? ctx.config.localQualifierPointsFor.usingTLS : 0)
        + ((tlsProtocol === "SSLv3") ? ctx.config.localQualifierPointsFor.usingSSLv3 : 0)
        + ((tlsProtocol === "TLSv1") ? ctx.config.localQualifierPointsFor.usingTLSv1_0 : 0)
        + ((tlsProtocol === "TLSv1.1") ? ctx.config.localQualifierPointsFor.usingTLSv1_1 : 0)
        + ((tlsProtocol === "TLSv1.2") ? ctx.config.localQualifierPointsFor.usingTLSv1_2 : 0)
        + ((tlsProtocol === "TLSv1.3") ? ctx.config.localQualifierPointsFor.usingTLSv1_3 : 0)
    );

    if (!arg.credentials) {
        return {
            authLevel: {
                basicLevels: new AuthenticationLevel_basicLevels(
                    AuthenticationLevel_basicLevels_level_none,
                    localQualifierPoints,
                    undefined,
                ),
            },
            failedAuthentication: ctx.config.forbidAnonymousBind,
        };
    }
    if ("simple" in arg.credentials) {
        const foundEntry = await findEntry(ctx, ctx.dit.root, arg.credentials.simple.name);
        if (!arg.credentials.simple.password) {
            return {
                boundVertex: foundEntry,
                boundNameAndUID: new NameAndOptionalUID(
                    arg.credentials.simple.name,
                    foundEntry?.dse.uniqueIdentifier?.[0],
                ),
                authLevel: {
                    basicLevels: new AuthenticationLevel_basicLevels(
                        AuthenticationLevel_basicLevels_level_none,
                        localQualifierPoints,
                        undefined,
                    ),
                },
                failedAuthentication: ctx.config.forbidAnonymousBind,
            };
        }
        const invalidCredentialsReturn: BindReturn = {
            boundNameAndUID: new NameAndOptionalUID(
                arg.credentials.simple.name,
                undefined,
            ),
            authLevel: {
                basicLevels: new AuthenticationLevel_basicLevels(
                    AuthenticationLevel_basicLevels_level_none,
                    localQualifierPoints,
                    undefined,
                ),
            },
            failedAuthentication: true,
        };
        if (!foundEntry) {
            return invalidCredentialsReturn;
        }
        if (arg.credentials.simple.validity) {
            const now = new Date();
            const minimumTime = arg.credentials.simple.validity.time1
                ? ("utc" in arg.credentials.simple.validity.time1)
                    ? arg.credentials.simple.validity.time1.utc
                    : arg.credentials.simple.validity.time1.gt
                : undefined;
            const maximumTime = arg.credentials.simple.validity.time2
                ? ("utc" in arg.credentials.simple.validity.time2)
                    ? arg.credentials.simple.validity.time2.utc
                    : arg.credentials.simple.validity.time2.gt
                : undefined;
            if (minimumTime && (minimumTime.valueOf() > (now.valueOf() + 5000))) { // 5 seconds of tolerance.
                return invalidCredentialsReturn;
            }
            if (maximumTime && (maximumTime.valueOf() < (now.valueOf() - 5000))) { // 5 seconds of tolerance.
                return invalidCredentialsReturn;
            }
        }
        // NOTE: Validity has no well-established meaning.
        const passwordIsCorrect: boolean | undefined = await attemptPassword(ctx, foundEntry, arg.credentials.simple.password);
        if (passwordIsCorrect) {
            return {
                boundVertex: foundEntry,
                boundNameAndUID: new NameAndOptionalUID(
                    getDistinguishedName(foundEntry),
                    foundEntry.dse.uniqueIdentifier?.[0], // We just use the first unique identifier.
                ),
                authLevel: {
                    basicLevels: new AuthenticationLevel_basicLevels(
                        AuthenticationLevel_basicLevels_level_simple,
                        localQualifierPoints,
                        undefined,
                    ),
                },
                failedAuthentication: false,
            };
        } else {
            return invalidCredentialsReturn;
        }
    } else {
        throw new SecurityError(
            ctx.i18n.t("err:unsupported_auth_method"),
            new SecurityErrorData(
                SecurityProblem_unsupportedAuthenticationMethod,
                undefined,
                undefined,
                [],
                createSecurityParameters(
                    ctx,
                    undefined,
                    undefined,
                    securityError["&errorCode"],
                ),
                ctx.dsa.accessPoint.ae_title.rdnSequence,
                false,
                undefined,
            ),
        );
    }
}

export default bind;
