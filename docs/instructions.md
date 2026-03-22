I would like to create a project that integrates Change Data Capture into my application using Kafka as the middle broker can you create a plan that supports the following:
- Create a deployment wizard that walks you through steps to deploy to kafka.
- A Kafka component that integrates into the Kafka connect framework.
 - Should generate the properties files for configuring kafka
 - Should include project mappings in output.
- Connect Component will use the mapping to get CDC Events from database and perform the required updates against a MarkLogic database.
- The should support bulk loading of data via MarkLogic Bulk Load features

Support for XML Namespaces
We need to support XML Namespaces,
-  Create an XML Namespace manager in the project front/backend
- Namespace Manager takes a list of namespaces and their corresponding URIs
- The manager should be able to resolve prefixes to URIs and vice versa
- The Namespace Manager should be integrated into the CDC event processing to ensure that XML data is correctly handled with respect to namespaces.
Project Plan:
1. **Project Initialization**
   - Set up a new project repository.
   - Define the project structure and necessary dependencies.
2. Create backend for XML Namespace manager
3. Integrate with Front End
   - Allow to add/remove namespaces and their corresponding URIs through the front end interface.
4. **Deployment Wizard Development**
   - Design the user interface for the deployment wizard.
5. Allow XML Mapping to support assigning an element namespace using prefix.

If you change the namespace on the element|inline card Can you prompt the user to update all child elements?
Can you add a feature to add back deleted fields from the model. Should have a + button on the card header that allows to add back elements that are only deleted.

Can you add a drag and drop feature for ordering elements|inline elements, but you cannot drag before root element

A few issues:
- The generate XML Documents button in light mode does not have contrast, cannot see button.
- Add custom field button has low text contrast can you make it darker grey
- Switch to Element|Attribute contrast in light mode needs to be fixed
- can you change default namespace to xmlns vs ns
- for MarkLogic Connections, Connections, Open Projects buttons. Can you not change color from light to dark mode. The background is always dark so no need to switch just keep the dark mode colors

## Migration Framework
I need a framework recommendation for Large Scale processing of data. I need a feature that supports batch loading with progress indicators. Ideally, I would like to use Spring Batch for loading. Should read data from relational database and write data to marklogic 

## UI Design
First generate a wizard interface, that guides you through the process. The steps are 
1. Select database connection->select MarkLogic connection.
2. Set directory path with ability to use variables from rootElement datasource. Set collections that you want to assign to data.
Once all the wizard steps are completed, Show me a loading page, that tracks progress writing to MarkLogic. Progress should include total database records and the # of records processed and elapsed timer.

## Backend (Java)
1. Create Batch Processing interface for deployment.
2. Create Required Models for deployment structure and repository that stores deployment jobs
3. Write infrastructure code to batch load all the data using a step based process in batches.

