exports = async function(changeEvent) {
    try {
        const serviceName = context.environment.values.service;
        const databaseName = context.environment.tag;

        const changeLogCollectionName = "auditlogs";
        const workflowsCollectionName = "workflows";
        const tenantCollectionName = "tenants";
        const tenantUserCollectionName = "tenantusers";
        const clientsCollectionName = "clients";  // New collection for clients
        const deletedRecordsCollectionName = "archiverecords";

        const mongodb = context.services.get(serviceName).db(databaseName);
        const workflowsCollection = mongodb.collection(workflowsCollectionName);
        const tenantCollection = mongodb.collection(tenantCollectionName);
        const tenantUserCollection = mongodb.collection(tenantUserCollectionName);
        const clientsCollection = mongodb.collection(clientsCollectionName);  // Collection for clients
        const changeLogCollection = mongodb.collection(changeLogCollectionName);
        const deletedRecordsCollection = mongodb.collection(deletedRecordsCollectionName);

        const docId = changeEvent.documentKey._id;
        const fullDocument = changeEvent.fullDocument || {};
        const userId = fullDocument.updatedBy || null; 
        const tenantId = fullDocument.tenantId || null;
        const entityType = fullDocument.entityType || changeEvent.ns.coll;

        
        const tenant = await tenantCollection.findOne({ _id: fullDocument.tenantId }, { workspaceIds: 1, tenantUsers: 1 });

        let user = null;
        let userName = 'Anonymous user';
        if (userId) {
            user = await tenantUserCollection.findOne({ _id: userId });
            if (!user) {
                const client = await clientsCollection.findOne({ _id: userId });
                if (client && client.name) {
                    userName = client.name;
                }
            } else {
                userName = user.firstName + (user.lastName ? ' ' + user.lastName : '');
            }
        }

        // Get workspaceId from tenant
        const workspaceId = tenant?.workspaceIds?.length > 0 ? tenant.workspaceIds[tenant.workspaceIds.length - 1] : null;

        // Prepare log entry
        let logEntry = {
            documentId: docId,
            userId: userId,
            userName: userName,  // Use the final userName
            tenantId: tenantId,
            workspaceId: workspaceId || null,
            entity: 'workflow',
            entityType: entityType,
            entitySlug: fullDocument.slug,
            action: changeEvent.operationType,
            timestamp: Math.floor(new Date().getTime() / 1000),
        };

        // Handle change events
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

        // Create notification summary
        function createNotificationSummary(changeEvent) {
           
            if (changeEvent.operationType === "insert") {
                return `${logEntry.userName} created ${fullDocument.title} workflow on ${fullDocument.updatedAt}`;
            }
            else if (changeEvent.operationType === "update") {
                const keysArray = Object.keys(changeEvent.updateDescription.updatedFields);
                if (keysArray.includes("status")) {
                    const { status } = changeEvent.updateDescription.updatedFields;
                    if (status === "filesSent") {
                        return `${logEntry.userName} published ${fullDocument.title} workflow on ${fullDocument.updatedAt}`;
                    }
                } 
            }
            else if (changeEvent.operationType === "delete") {
                return `${logEntry.userName} deleted ${fullDocument.title} workflow`;
            }else{
                return `${logEntry.userName} updated ${fullDocument.title} workflow on ${fullDocument.updatedAt}`;
            }
        }

        // Insert notification entry
        if (changeEvent.operationType === "insert" || changeEvent.operationType === "update" || changeEvent.operationType === "delete") {
            const notificationCollection = mongodb.collection('notifications');
            const notificationEntry = {
                referenceId: changeEvent._id._data,  
                tenantId: tenantId || null,
                entityType: entityType,
                entityId: docId,
                entity: 'workflow',
                entitySlug: fullDocument.slug ? fullDocument.slug : null,
                workspaceId: workspaceId || null,
                action: changeEvent.operationType,
                summary: createNotificationSummary(changeEvent),
                receipts: [],
                createdBy: logEntry.userId,
                readBy: [],
                timestamp: Math.floor(new Date().getTime() / 1000),
                isAdmin: true,
                hasFullAccess: true,
                notifyChannels: ['app', 'dashboard']
            };
            await notificationCollection.insertOne(notificationEntry);
        }

    } catch (error) {
        console.log("Error performing mongodb operation: ", error.message);
    }
}
