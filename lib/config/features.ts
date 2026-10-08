export const features = Object.freeze({
    ai: process.env.MDVORO_ENABLE_AI === 'true',
});
export function assertFeatureEnabled(feature: keyof typeof features) {
    if (!features[feature])
        throw new Error(`feature_disabled:${feature}`);
}

