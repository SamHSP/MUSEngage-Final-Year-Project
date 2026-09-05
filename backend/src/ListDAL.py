from bson import ObjectId # mongodb object Id 
# Note: mongodb is a document-oriented database Each database contains 
# a collections, each collection contains  a document stored as BSON (Binary JSON).
from motor.motor_asyncio import AsyncIOMotorCollection # mongodb async driver
from pymongo import ReturnDocument # Return behaviour and update operations
from uuid import uuid4 #unique id
from model import ListSummary, List


## List Data Access Layer
class ListDAL:
    
    # Initialize the collection object from motor's async MongoDB driver.
    def __init__(self, lists: AsyncIOMotorCollection):
        self.__lists = lists
    
    # async for loop iterates through the entire __lists and yields the results.
    # in this case, it returns the name of the list and how many items are in it. 
    async def list_summary(self, session=None):
        async for doc in self.__lists.find(
                {},
                projection={
                    "name": 1,
                    "item_count": {"$size": "$items"}
                    },
                sort={"name": 1},
                session=session,
                ):
            yield ListSummary.from_doc(doc)


    # Create a list, a list contains a name and an array of items.
    # The array is only being initialized, Data is to be inserted into 
    # the items array later.
    async def create_list(self, name: str, session=None) -> str:
        response = await self.__lists.insert_one(
                {"name": name, "items": []},
                session=session,
                )
        return str(response.inserted_id)

    # Return a list document.
    async def get_list(self, id: str | ObjectId, session=None) -> List:
        doc = await self.__lists.find_one(
                {"_id": ObjectId(id)},
                session=session,
                )
        return List.from_doc(doc)


    # Delete a list document. 
    async def delete_list(self, id: str | ObjectId, session=None) -> bool:
        response = await self.__lists.delete_one(
                {"_id": ObjectId(id)},
                session=session,
                )
        return response.deleted_count == 1

    # Insert an item into a list. Therefore you need the ObjectId of the List
    # If a record contains a unique identifier, that can be used instead of 
    # `_id`
    async def create_item(
            self,
            id: str | ObjectId,
            label: str,
            session=None,
            ) -> List |None:
        result = await self.__lists.find_one_and_update(
                {"_id": ObjectId(id)},
                {
                    "$push": {
                        "items":{
                            "id": uuid4().hex,
                            "label": label,
                            "checked": False,
                            }
                        }
                    },
                session=session,
                return_document=ReturnDocument.AFTER,
                )
        if result:
            return List.from_doc(result)

    # Inside a list contains a field of type boolean This function updates the 
    #value of that field. It defaults to false during insertion.

    async def set_checked_state(
            self,
            doc_id: str | ObjectId, 
            item_id: str,
            checked_state: bool,
            session=None,
            ) -> List | None:
        result = await self.__lists.find_one_and_update(
                {"_id": ObjectId(doc_id), "items.id": item_id},
                {"$set": {"items.$.checked": checked_state}},
                session=session,
                return_document=ReturnDocument.AFTER,
                )
        if result:
            return List.from_doc(result)
    
    # Deletes an Item in that list. Pulls an item in the items[] array of a list
    # with the corresponding id that matches with item_id.
    async def delete_item(
            self,
            doc_id: str | ObjectId,
            item_id: str,
            session=None,
            ) -> List | None:
        result = await self.__lists.find_one_and_update(

                {"_id": ObjectId(doc_id)},
                {"$pull": {"items": {"id": item_id}}},
                session=session,
                 return_document=ReturnDocument.AFTER,
                )
        if result:
            return List.from_doc(result)

