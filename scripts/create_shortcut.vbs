' Create Windows shortcut (.lnk file)
' Usage: cscript //nologo create_shortcut.vbs "C:\path\to\target.exe" "C:\path\to\shortcut.lnk" "Description"

Set objArgs = WScript.Arguments
If objArgs.Count < 2 Then
    WScript.Echo "Usage: create_shortcut.vbs <target_path> <shortcut_path> [description]"
    WScript.Quit 1
End If

strTargetPath = objArgs(0)
strShortcutPath = objArgs(1)
strDescription = "Offline Scouting Manager"
If objArgs.Count >= 3 Then
    strDescription = objArgs(2)
End If

Set objShell = WScript.CreateObject("WScript.Shell")
Set objShortcut = objShell.CreateShortcut(strShortcutPath)

objShortcut.TargetPath = strTargetPath
objShortcut.WorkingDirectory = objShell.ExpandEnvironmentStrings("%USERPROFILE%")
objShortcut.Description = strDescription
objShortcut.IconLocation = strTargetPath & ",0"

objShortcut.Save

WScript.Echo "Shortcut created: " & strShortcutPath
