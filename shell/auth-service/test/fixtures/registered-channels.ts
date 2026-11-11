/**
 * The channel types these tests attach identities for, admitted the way a
 * channel registry admits them. Without one, only reserved types are.
 */
export const registeredTestChannels = {
  isChannelTypeRegistered: (type: string): boolean =>
    type === "email" || type === "discord",
};
