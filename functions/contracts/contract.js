exports = async function(changeEvent) {
    try{

        const serviceName = context.environment.values.service;
        const databaseName = context.environment.tag;


        const changeLogCollectionName = "auditlogs";
        const contractsCollectionName = "contracts";
        const tenantCollectionName = "tenants";
        const tenantUserCollectionName = "tenantusers";

        const mongodb = context.services.get(serviceName).db(databaseName);
        const contractsCollection = mongodb.collection(contractsCollectionName);
        const tenantCollection = mongodb.collection(tenantCollectionName);
        const tenantUserCollection = mongodb.collection(tenantUserCollectionName);
        const changeLogCollection = mongodb.collection(changeLogCollectionName);


        const docId = changeEvent.documentKey._id;
        const fullDocument = changeEvent.fullDocument || {};
        const userId = fullDocument.createdBy || null;
        const tenantId = fullDocument.tenantId || null;
        const entityType = fullDocument.entityType || changeEvent.ns.coll;
        const tenant = await tenantCollection.findOne({ _id: fullDocument.tenantId }, { workspaceIds: 1, tenantUsers: 1 })
        const user = await tenantUserCollection.findOne({ _id: userId }, { _id: 1, firstName: 1, lastName: 1 });
        const workspaceId = tenant?.workspaceIds[tenant.workspaceIds.length - 1] || null; 


        let logEntry = {
            documentId: docId,
            userId: user ? user._id : null,
            userName: user ? (user.lastName ? user.firstName + user.lastName : user.firstName) : null,
            tenantId: tenantId,
            workspaceId: workspaceId,
            entity: 'contract',
            entityType: entityType,
            entitySlug: fullDocument.slug,
            action: changeEvent.operationType,
            timestamp:Math.floor(new Date().getTime()/1000)
          };

          if (changeEvent.updateDescription.updatedFields && changeEvent.updateDescription.updatedFields.signatures) {
            const updatedSignatures = changeEvent.updateDescription.updatedFields.signatures;
            if (updatedSignatures && updatedSignatures.length > 0) {
                const signature = updatedSignatures[updatedSignatures.length-1]; 
                logEntry.userId = signature._id || null; 
                logEntry.userName = signature.userName || null;
            }
          }

        if(changeEvent.operationType==="update"){
            const updateEntry = {
                ...logEntry,
                changes: changeEvent.updateDescription.updatedFields || {},
            };
            if (changeEvent.updateDescription.updatedFields && changeEvent.updateDescription.updatedFields.signatures && changeEvent.updateDescription.updatedFields.signatures.length>0) {
                await changeLogCollection.insertOne(updateEntry);
            }
        }

        function createNotificationSummary(changeEvent) {
            if (changeEvent.operationType === "update") {
                const keysArray = Object.keys(changeEvent.updateDescription.updatedFields);
                if (keysArray.includes("signatures")) {
                    const { signatures } = changeEvent.updateDescription.updatedFields;
                    if (signatures && signatures.length > 0) {
                        const hasTenantUser = signatures.some(signature => signature.userType === "TenantUser");
                        if (!hasTenantUser) {
                            const endUserSignature = signatures.find(signature => signature.userType === "endUser");
                            if (endUserSignature) {
                                return `${logEntry?.userName || 'Anonymous user'} signed ${fullDocument.title} contract on ${fullDocument.updatedAt}`;
                            }
                        }
                    }
                }
            }
           
        }

        if (changeEvent.operationType === "update") {
            const notificationCollection = mongodb.collection('notifications');
            const keysArray = Object.keys(changeEvent.updateDescription.updatedFields);
        
            if (keysArray.includes('signatures')) {
                const { signatures } = changeEvent.updateDescription.updatedFields;
                if (signatures && signatures.length > 0) {
                    const hasTenantUser = signatures.some(signature => signature.userType === "TenantUser");
                    const hasEndUser = signatures.some(signature => signature.userType === "endUser");
                    if (!hasTenantUser && hasEndUser) {
                        const notificationEntry = {
                            referenceId: changeEvent._id._data,
                            tenantId: tenantId ? tenantId : null,
                            entityType: entityType,
                            entityId: docId,
                            entity: 'contract',
                            entitySlug: fullDocument.slug ? fullDocument.slug : null,
                            workspaceId: workspaceId ? workspaceId : null,
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
                }
            }
        }
        
        
    }catch(error){
        console.log("Error performing mongodb operation: ",error.message);
    }
}