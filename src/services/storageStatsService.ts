export interface StorageStats {
    totalActiveDocs: number;
    limit: number;
    percentage: string;
    collections: Record<string, number>;
  }
  
  export async function getStorageUsageStats(): Promise<StorageStats | null> {
    try {
      const res = await fetch('/api/archive/status');
      if (!res.ok) throw new Error('Failed to fetch storage stats');
      const data = await res.json();
      if (data.success) {
        return data.stats;
      }
      return null;
    } catch (error) {
      console.error("Error fetching storage stats:", error);
      return null;
    }
  }
  
  export async function triggerManualArchive(): Promise<boolean> {
      try {
          const res = await fetch('/api/archive/trigger', {
              method: 'POST'
          });
          const data = await res.json();
          return data.success;
      } catch (error) {
          console.error("Error triggering archive:", error);
          return false;
      }
  }
  
