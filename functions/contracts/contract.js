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

        let logEntry = {
            documentId: docId,
            userId: user ? user._id : null,
            userName: user ? (user.lastName ? user.firstName + user.lastName : user.firstName) : null,
            tenantId: tenantId,
            workspaceId: tenant?.workspaceIds[tenant.workspaceIds.length-1] || null,
            entity: 'contract',
            entityType: entityType,
            entitySlug: fullDocument.slug,
            action: changeEvent.operationType,
            timeStamp:Math.floor(new Date().getTime()/1000)
          };

          if (changeEvent.updateDescription.updatedFields && changeEvent.updateDescription.updatedFields.signatures) {
            const updatedSignatures = changeEvent.updateDescription.updatedFields.signatures;
            if (updatedSignatures && updatedSignatures.length > 0) {
                const signature = updatedSignatures[updatedSignatures.length-1]; 
                logEntry.userId = signature._id || null; 
                logEntry.userName = signature.userName || null;
                logEntry.userType = signature.userType || null;
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
    }catch(error){
        console.log("Error performing mongodb operation: ",error.message);
    }
}