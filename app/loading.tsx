export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-white">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Loading StoryFlow Studio...</p>
      </div>
    </div>
  );
}
