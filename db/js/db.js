var db = null;

$(document).ready(function(){



    if (window.openDatabase) {
    
        db = openDatabase("mydb", "1.0", "my test database", 100000);
        
        loaded();
        
        
        
    }
    else {
    
        alert("Couldn't open database.")
        
    }
    
    
    $('#inputForm').bind('submit', submitHandler)
});

function submitHandler(event){
    event.preventDefault();
    
    var query = $(this).find('input').val();
    
    insert(query);
    
    
}


function insert(query){


    db.transaction(function(tx){
    
        tx.executeSql("INSERT INTO table1 (note, timestamp) values (?, ?)", [query, Date.now()]);
        showContents();    
    });
    
}

function deleteTable(){

    db.transaction(function(tx){
    
        tx.executeSql("DROP TABLE table1", [], function(result){
            console.log("table dropped")
        });
        
    });
    
}

function showContents(){

    db.transaction(function(tx){
    
        tx.executeSql("SELECT note FROM table1", [], function(tx, result){
            var html = [];
            
            for (var i = 0; i < result.rows.length; ++i) {
                var row = result.rows.item(i);
                
                html.push(row['note']);
            }
            
            $("#output").html(html.join("<br/>"))
            
        });
        
    });
    
}

function loaded(){

    db.transaction(function(tx){
        tx.executeSql("SELECT COUNT(*) FROM table1", [], function(result){
            
            showContents()
        
        }, function(tx, error){
            tx.executeSql("CREATE TABLE table1 (id INTEGER PRIMARY KEY, note TEXT, timestamp REAL)", [], function(result){
                alert("table created succesfully");
            });
        });
    });
    
}



