exports = async function(changeEvent) {
    try {
        const serviceName = context.environment.values.service;
        const databaseName = context.environment.tag;

        const changeLogCollectionName = "auditlogs";
        const workflowsCollectionName = "workflows";
        const tenantCollectionName = "tenants";
        const tenantUserCollectionName = "tenantusers";
        const deletedRecordsCollectionName = "archiverecords";

        const mongodb = context.services.get(serviceName).db(databaseName);
        const workflowsCollection = mongodb.collection(workflowsCollectionName);
        const tenantCollection = mongodb.collection(tenantCollectionName);
        const tenantUserCollection = mongodb.collection(tenantUserCollectionName);
        const changeLogCollection = mongodb.collection(changeLogCollectionName);
        const deletedRecordsCollection = mongodb.collection(deletedRecordsCollectionName);

        const docId = changeEvent.documentKey._id;
        const fullDocument = changeEvent.fullDocument || {};
        const userId = fullDocument.updatedBy || null;
        const tenantId = fullDocument.tenantId || null;
        const entityType = fullDocument.entityType || changeEvent.ns.coll;

        // Check if tenantId exists before querying the tenant collection
        let tenant = null;
        if (tenantId) {
            tenant = await tenantCollection.findOne({ _id: tenantId }, { workspaceIds: 1, tenantUsers: 1 });
        }

        // Check if userId exists before querying the tenantUser collection
        let user = null;
        if (userId) {
            user = await tenantUserCollection.findOne({ _id: userId }, { _id: 1, firstName: 1, lastName: 1 });
        }

        let userName = null;
        if (user) {
            userName = user ? (user.lastName ? user.firstName + user.lastName : user.firstName) : null;
        }

        let workspaceId = null;
        if (tenant && tenant.workspaceIds && tenant.workspaceIds.length > 0) {
            workspaceId = tenant.workspaceIds[tenant.workspaceIds.length - 1];
        }

        let logEntry = {
            documentId: docId,
            userId: userId,
            userName: userName || null,  // Handle case where userName might be null
            tenantId: tenantId,
            workspaceId: workspaceId || null,  // Handle case where workspaceId might be null
            entity: 'workflow',
            entityType: entityType,
            entitySlug: fullDocument.slug,
            action: changeEvent.operationType,
            timestamp: Math.floor(new Date().getTime() / 1000),
        };

        if (changeEvent.operationType === "insert") {
            const insertEntry = {
                ...logEntry,
                newDocument: changeEvent.fullDocument,
            };
            await changeLogCollection.insertOne(insertEntry);
        }
        else if (changeEvent.operationType === "update") {
            const updateEntry = {
                ...logEntry,
                changes: changeEvent.updateDescription.updatedFields || {},
                removedFields: changeEvent.updateDescription.removedFields || []
            };
            await changeLogCollection.insertOne(updateEntry);
        }
        else if (changeEvent.operationType === "delete") {
            const deleteEntry = {
                ...logEntry
            };
            await deletedRecordsCollection.insertOne(deleteEntry);
        }
    } catch (error) {
        console.log("Error performing mongodb operation: ", error.message);
    }
}
