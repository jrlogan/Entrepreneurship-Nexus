"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readExternalRefIndex = exports.externalRefIndexId = exports.globalIndexId = void 0;
const globalIndexId = (entityType, ref) => `${entityType}:${ref.source}:${ref.id}`;
exports.globalIndexId = globalIndexId;
const externalRefIndexId = (entityType, ref) => ref.owner_org_id
    ? `${entityType}:${ref.owner_org_id}:${ref.source}:${ref.id}`
    : (0, exports.globalIndexId)(entityType, ref);
exports.externalRefIndexId = externalRefIndexId;
const readExternalRefIndex = async (db, entityType, ref) => {
    const collection = db.collection('external_ref_index');
    if (ref.owner_org_id) {
        const scoped = await collection.doc((0, exports.externalRefIndexId)(entityType, ref)).get();
        if (scoped.exists)
            return scoped;
    }
    const legacy = await collection.doc((0, exports.globalIndexId)(entityType, ref)).get();
    if (!legacy.exists)
        return null;
    const owner = legacy.get('owner_org_id');
    if (ref.owner_org_id && owner && owner !== ref.owner_org_id)
        return null;
    return legacy;
};
exports.readExternalRefIndex = readExternalRefIndex;
