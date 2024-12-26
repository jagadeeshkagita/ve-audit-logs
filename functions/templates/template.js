exports = async function(changeEvent) {
    try{
        const serviceName = context.environment.values.service;
        const databaseName = context.environment.tag;


        const changeLogCollectionName = "auditlogs";
        const workflowtemplatesCollectionName = "workflowtemplates";
        const tenantCollectionName = "tenants";
        const tenantUserCollectionName = "tenantusers";
       

        const mongodb = context.services.get(serviceName).db(databaseName);
        const workflowtemplatesCollection = mongodb.collection(workflowtemplatesCollectionName);
        const tenantCollection = mongodb.collection(tenantCollectionName);
        const tenantUserCollection = mongodb.collection(tenantUserCollectionName);
        const changeLogCollection = mongodb.collection(changeLogCollectionName);        

        const docId = changeEvent.documentKey._id;
        const fullDocument = changeEvent.fullDocument || {};
        const userId = fullDocument.updatedBy || null;
        const tenantId = fullDocument.tenantId || null;
        const entityType = fullDocument.entityType || changeEvent.ns.coll;
        const tenant = await tenantCollection.findOne({ _id: fullDocument.tenantId }, { workspaceIds: 1, tenantUsers: 1 })
        const user = await tenantUserCollection.findOne({ _id: userId }, { _id: 1, firstName: 1, lastName: 1 });
        
        let logEntry = {
            documentId: docId,
            userId: userId,
            userName:  user ? (user.lastName ? user.firstName + user.lastName : user.firstName) : null,
            tenantId: tenantId,
            workspaceId: tenant?.workspaceIds[tenant.workspaceIds.length-1] || null,
            entity: 'workflowtemplate',
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
        else if(changeEvent.operationType==="update"){
            const updateEntry = {
                ...logEntry,
                changes: changeEvent.updateDescription.updatedFields || {},
                removedFields: changeEvent.updateDescription.removedFields || []
            };
            await changeLogCollection.insertOne(updateEntry);
        }
        
    } 
    catch(error){
        console.log("Error performing mongodb operation: ",error.message);
    }
}