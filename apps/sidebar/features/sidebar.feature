Feature: Agent sidebar

  Scenario: The list shows who is waiting on you
    Given the app is open
    Then "Waiting on you" shows "1"
    And the "Pinned" section lists "Inbox triage"
    And the "Hangar" section lists "Release notes, Flaky test hunt"

  Scenario: Filtering by name or tag
    Given the app is open
    When I filter agents by "ops"
    Then the "Homelab" section lists "Backup check"
    And there is no "Hangar" section

  Scenario: Collapsing a section survives a reload
    Given the app is open
    When I toggle the "Hangar" section
    And I reload the page
    Then the "Hangar" section lists ""

  Scenario: Pinning from an agent's menu
    Given the app is open
    When I choose "Pin or unpin" from the menu of "Trip planning"
    Then the "Pinned" section lists "Inbox triage, Trip planning"

  Scenario: Editing tags
    Given the app is open
    When I choose "Edit tags" from the menu of "Trip planning"
    And I fill "Tags" with "Travel, summer"
    And I press "Save tags"
    Then the row "Trip planning" shows "travel, summer"

  Scenario: Moving an agent into a new project
    Given the app is open
    When I press "New project"
    And I fill "Project name" with "Holidays"
    And I press "Add project"
    And I choose "Move to a project" from the menu of "Trip planning"
    And I select "Holidays" for "Project"
    And I press "Move agent"
    Then the "Holidays" section lists "Trip planning"

  Scenario: An agent started offline is sent once the connection is back
    Given the app is open
    When I go offline
    And I press "Start an agent"
    And I fill "What should it work on?" with "Write the changelog"
    And I press "Start agent"
    Then the "Chats" section lists "Write the changelog, Trip planning"
    And "Not yet sent" shows "1"
    When I go online
    Then "Not yet sent" shows "0"

  Scenario: Opening an agent and coming back
    Given the app is open
    When I open the agent "Release notes"
    Then the page heading is "Release notes"
    When I go back
    Then the page heading is "Agents"

  Scenario: Coming back to where I had scrolled to
    Given the app is open
    When I scroll down by 200
    And I open the agent "Backup check"
    Then the page heading is "Backup check"
    And the page is at the top
    When I go back
    Then the page heading is "Agents"
    And the page is back where I scrolled to

  Scenario: A link to an agent that does not exist
    Given the app is open at "/agents/nobody"
    Then I see the alert "There is no agent called nobody. It may have been removed."
