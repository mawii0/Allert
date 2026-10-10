"""Start the private model service on the port assigned by its host."""
import os
import uvicorn

if __name__ == '__main__':
    uvicorn.run('integration.hosted_api:app', host=os.environ.get('ALLERT_BIND_HOST', '0.0.0.0'),
                port=int(os.environ.get('PORT', '8000')), workers=1)
