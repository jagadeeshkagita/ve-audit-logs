exports = async function(changeEvent) {
    try{

        const serviceName = context.environment.values.service;
        const databaseName = context.environment.tag;


        const changeLogCollectionName = "auditlogs";
        const proposalsCollectionName = "proposals";
        const tenantCollectionName = "tenants";
        const tenantUserCollectionName = "tenantusers";

        const mongodb = context.services.get(serviceName).db(databaseName);
        const proposalsCollection = mongodb.collection(proposalsCollectionName);
        const tenantCollection = mongodb.collection(tenantCollectionName);
        const tenantUserCollection = mongodb.collection(tenantUserCollectionName);
        const changeLogCollection = mongodb.collection(changeLogCollectionName);


        const docId = changeEvent.documentKey._id;
        const fullDocument = changeEvent.fullDocument || {};
        const tenantId = fullDocument.tenantId || null;
        const entityType = fullDocument.entityType || changeEvent.ns.coll;
        const latestVersion = fullDocument.versions ? fullDocument.versions.slice(-1)[0] : null;
        const user = latestVersion && latestVersion.createdBy ? await tenantUserCollection.findOne({ _id: latestVersion.createdBy }, { firstName: 1, lastName: 1 }) : null;
        let userName = null
        userName = user && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName;
        const tenant = await tenantCollection.findOne({ _id: fullDocument.tenantId }, { workspaceIds: 1, tenantUsers: 1 }); 

        let logEntry = {
            documentId: docId,
            userId: user ? user._id : null,
            userName: user ? `${user.firstName} ${user.lastName}` : null,
            tenantId: tenantId,
            workspaceId: tenant?.workspaceIds[tenant.workspaceIds.length-1] || null,
            entity: 'proposal',
            entityType: entityType,
            entitySlug: fullDocument.slug,
            action: changeEvent.operationType,
            timeStamp:Math.floor(new Date().getTime()/1000)
          };

          if (changeEvent.updateDescription.updatedFields && changeEvent.updateDescription.updatedFields.status && changeEvent.updateDescription.updatedFields.status === 'accepted') {
            logEntry.userId = fullDocument?.acceptedBy?._id
            logEntry.userName = fullDocument?.acceptedBy?.name
        }

          if(changeEvent.operationType==="update"){
            const updateEntry = {
                ...logEntry,
                changes: changeEvent.updateDescription.updatedFields || {},
                removedFields: changeEvent.updateDescription.removedFields || []
            };
            if (changeEvent.updateDescription.updatedFields && changeEvent.updateDescription.updatedFields.status === 'accepted') {
                await changeLogCollection.insertOne(updateEntry);
            }
        }
    }
    catch(error){
        console.log("Error performing mongodb operation: ",error.message);
    }
}