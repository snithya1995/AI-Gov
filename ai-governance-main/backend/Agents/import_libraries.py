from dotenv import load_dotenv

from agents.library_store import import_excel_libraries, library_counts

load_dotenv()


if __name__ == "__main__":
    # 1. Run the import/seeding
    result = import_excel_libraries()
    
    # 2. Get the current status from MongoDB
    counts = library_counts()
    
    if not counts.get("mongo_connected", False):
        print("⚠️ Warning: Could not connect to MongoDB. Please check if your MongoDB container is running and MONGODB_URI is set correctly in .env.")
    else:
        print("Imported/Updated library records (New changes):")
        for name, count in result.items():
            print(f"- {name}: {count}")
            
        print("\nTotal library records currently in MongoDB:")
        print(f"- ai_risks: {counts.get('ai_risks', 0)}")
        print(f"- cyber_risks: {counts.get('cyber_risks', 0)}")
        print(f"- ai_controls: {counts.get('ai_controls', 0)}")
        print(f"- nist_controls: {counts.get('nist_controls', 0)}")